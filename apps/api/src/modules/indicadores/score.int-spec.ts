import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { PARAMETROS, type Parametros } from '../../shared/config/parametros.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import type { StatusOcorrencia } from '../ocorrencias/domain/ocorrencia.js';
import { DESEMPENHO_ORGAOS, type DesempenhoOrgaos } from './application/portas.js';
import { RecalcularScore } from './application/recalcular-score.js';

const SOROCABA = 3552205;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

interface RespostaScore {
  score: number | null;
  classificacao: string | null;
  resolvidas_pct: number | null;
  dias_mediana: number | null;
  por_categoria: { categoria_id: number; nome: string; total: number; resolvidas: number }[];
  janela_dias: number;
  calculado_em: string | null;
}

function haDias(dias: number, agora: number): string {
  return new Date(agora - dias * UM_DIA_MS).toISOString();
}

describe('score de reputação (job e API)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let parametros: Parametros;
  let desempenhos: DesempenhoOrgaos;
  let recalcular: RecalcularScore;
  let orgaoId: number;
  let autorId: string;
  let sequencia = 0;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    parametros = app.get<Parametros>(PARAMETROS);
    desempenhos = app.get<DesempenhoOrgaos>(DESEMPENHO_ORGAOS);
    recalcular = app.get(RecalcularScore);

    await aplicarCargaInicial(prisma);
    orgaoId = (await prisma.orgao.findFirstOrThrow({ where: { municipioId: SOROCABA } })).id;

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    autorId = (
      await prisma.usuario.create({
        data: {
          nome: 'Moradora de Sorocaba',
          apelidoPublico: 'moradora',
          email: 'moradora@exemplo.test',
          papel: 'CIDADAO',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, desempenho_orgao, protocolo_sequencia CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
  });

  async function criarUsuario(indice: number): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: `Avaliador ${indice}`,
        apelidoPublico: `aval${indice}`,
        email: `aval.${indice}.${randomUUID()}@exemplo.test`,
        papel: 'CIDADAO',
      },
    });
    return usuario.id;
  }

  async function inserirOcorrencia(opcoes: {
    status: StatusOcorrencia;
    categoria?: string;
    criadaHaDias: number;
    resolvidaHaDias?: number;
    agoraMs?: number;
  }): Promise<string> {
    const id = randomUUID();
    sequencia += 1;
    const protocolo = `FA-2026-SOR-${String(sequencia).padStart(6, '0')}`;
    const agora = opcoes.agoraMs ?? Date.now();
    const resolvidaEm =
      opcoes.resolvidaHaDias === undefined ? null : haDias(opcoes.resolvidaHaDias, agora);
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em, resolvida_em)
      VALUES (${id}::uuid, ${protocolo}, ${autorId}::uuid,
              (SELECT id FROM categoria WHERE slug = ${opcoes.categoria ?? 'iluminacao'}),
              ${SOROCABA}, ${orgaoId}, 'Lâmpada queimada na rua principal do bairro',
              ST_SetSRID(ST_MakePoint(-47.4526::float8, -23.5015::float8), 4326)::geography,
              'Rua A, 1 · Centro', ${opcoes.status}::status_ocorrencia,
              ${haDias(opcoes.criadaHaDias, agora)}::timestamptz, ${resolvidaEm}::timestamptz)`;
    return id;
  }

  async function inserirAvaliacao(
    ocorrenciaId: string,
    usuarioId: string,
    nota: number,
  ): Promise<void> {
    await prisma.avaliacao.create({ data: { ocorrenciaId, usuarioId, nota } });
  }

  async function consultarScore(query = ''): Promise<{ status: number; corpo: RespostaScore }> {
    const resposta = await app.inject({
      method: 'GET',
      url: `${PREFIXO_API}/indicadores/score${query}`,
    });
    return { status: resposta.statusCode, corpo: resposta.json() };
  }

  it('massa equivalente ao caso de referência devolve 7,0 "Regular", sem duplicadas e contando recusadas', async () => {
    const agoraMs = Date.now();
    // Em iluminacao, o sla_dias padrão é 15 dias.
    const idsResolvidas: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      idsResolvidas.push(
        await inserirOcorrencia({
          status: 'RESOLVIDA',
          categoria: 'iluminacao',
          criadaHaDias: 20,
          resolvidaHaDias: 17, // 3 dias (no prazo)
          agoraMs,
        }),
      );
    }
    for (let i = 0; i < 18; i += 1) {
      idsResolvidas.push(
        await inserirOcorrencia({
          status: 'RESOLVIDA',
          categoria: 'iluminacao',
          criadaHaDias: 30,
          resolvidaHaDias: 10, // 20 dias (fora do prazo de 15 dias)
          agoraMs,
        }),
      );
    }
    for (let i = 0; i < 30; i += 1) {
      await inserirOcorrencia({
        status: 'EM_ANALISE',
        categoria: 'pavimentacao',
        criadaHaDias: 15,
        agoraMs,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      await inserirOcorrencia({
        status: 'RECUSADA',
        categoria: 'pavimentacao',
        criadaHaDias: 15,
        agoraMs,
      });
    }
    // Duplicada e fora da janela (95 dias) precisam ficar de fora.
    await inserirOcorrencia({
      status: 'DUPLICADA',
      categoria: 'iluminacao',
      criadaHaDias: 10,
      agoraMs,
    });
    await inserirOcorrencia({
      status: 'RESOLVIDA',
      categoria: 'iluminacao',
      criadaHaDias: 95,
      resolvidaHaDias: 94,
      agoraMs,
    });

    // 40 avaliações com média exata 3,8: 32 notas 4 + 8 notas 3 = 152 / 40 = 3,8.
    const avaliador = await criarUsuario(1);
    for (let i = 0; i < 40; i += 1) {
      await inserirAvaliacao(idsResolvidas[i]!, avaliador, i < 32 ? 4 : 3);
    }

    await recalcular.executar(new Date(agoraMs));

    const { status, corpo } = await consultarScore(`?municipio=${SOROCABA}`);
    expect(status).toBe(200);
    expect(corpo.score).toBe(7.0);
    expect(corpo.classificacao).toBe('Regular');
    expect(corpo.resolvidas_pct).toBe(68.0);
    expect(corpo.dias_mediana).toBe(3.0);
    expect(corpo.janela_dias).toBe(90);
    expect(corpo.calculado_em).toBeTruthy();
    expect(corpo.por_categoria).toEqual([
      expect.objectContaining({ nome: 'Iluminação', total: 68, resolvidas: 68 }),
      expect.objectContaining({ nome: 'Pavimentação', total: 32, resolvidas: 0 }),
    ]);
  });

  it('mudar os pesos nos parâmetros e recalcular muda o score sem alterar código', async () => {
    const agoraMs = Date.now();
    for (let i = 0; i < 10; i += 1) {
      await inserirOcorrencia({
        status: 'RESOLVIDA',
        categoria: 'iluminacao',
        criadaHaDias: 20,
        resolvidaHaDias: 10, // fora do prazo
        agoraMs,
      });
    }

    await recalcular.executar(new Date(agoraMs));
    const antes = (await consultarScore(`?municipio=${SOROCABA}`)).corpo.score!;

    const alterados: Parametros = {
      ...parametros,
      score: {
        ...parametros.score,
        pesos: { resolucao: 0.8, prazo: 0.1, satisfacao: 0.1 },
      },
    };
    await new RecalcularScore(desempenhos, alterados).executar(new Date(agoraMs));
    const depois = (await consultarScore(`?municipio=${SOROCABA}`)).corpo.score!;

    expect(depois).not.toBe(antes);
    expect(depois).toBeGreaterThan(antes);
  });

  it('uma nova avaliação muda satisfacao_media no recálculo seguinte', async () => {
    const agoraMs = Date.now();
    const id1 = await inserirOcorrencia({
      status: 'RESOLVIDA',
      criadaHaDias: 10,
      resolvidaHaDias: 8,
      agoraMs,
    });
    const id2 = await inserirOcorrencia({
      status: 'RESOLVIDA',
      criadaHaDias: 10,
      resolvidaHaDias: 8,
      agoraMs,
    });
    const u1 = await criarUsuario(10);
    await inserirAvaliacao(id1, u1, 5);

    await recalcular.executar(new Date(agoraMs));
    const antes = await prisma.desempenhoOrgao.findUniqueOrThrow({ where: { orgaoId } });
    expect(antes.satisfacaoMedia?.toNumber()).toBe(5);

    await inserirAvaliacao(id2, u1, 1);
    await recalcular.executar(new Date(agoraMs + 60_000));
    const depois = await prisma.desempenhoOrgao.findUniqueOrThrow({ where: { orgaoId } });
    expect(depois.satisfacaoMedia?.toNumber()).toBe(3);
  });

  it('órgão sem ocorrências tem score e classificação nulos', async () => {
    await recalcular.executar();

    const { status, corpo } = await consultarScore(`?municipio=${SOROCABA}`);
    expect(status).toBe(200);
    expect(corpo).toMatchObject({
      score: null,
      classificacao: null,
      resolvidas_pct: null,
      dias_mediana: null,
      por_categoria: [],
      janela_dias: 90,
    });
    expect(corpo.calculado_em).toBeTruthy();
  });
});
