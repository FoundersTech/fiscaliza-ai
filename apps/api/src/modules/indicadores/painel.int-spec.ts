import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import type { StatusOcorrencia } from '../ocorrencias/domain/ocorrencia.js';
import { CONSULTAS_PAINEL, type ConsultasPainel } from './application/portas.js';

const SOROCABA = 3552205;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

interface Painel {
  vazio: boolean;
  periodo_dias: number;
  total: number;
  resolvidas: number;
  resolvidas_pct: number | null;
  dias_mediana: number | null;
  por_categoria: { slug: string; nome: string; icone: string; total: number; resolvidas: number }[];
  calculado_em: string;
}

interface NovaOcorrencia {
  status?: StatusOcorrencia;
  categoria?: string;
  /** Há quantos dias foi registrada. */
  criadaHa: number;
  /** Há quantos dias foi resolvida. */
  resolvidaHa?: number;
}

/** Todas as chaves de um objeto, com o caminho: ['por_categoria', 'por_categoria.slug', ...]. */
function chavesDe(valor: unknown, prefixo = ''): string[] {
  if (Array.isArray(valor)) return valor.length ? chavesDe(valor[0], prefixo) : [];
  if (typeof valor !== 'object' || valor === null) return [];
  return Object.entries(valor)
    .flatMap(([chave, filho]) => {
      const caminho = prefixo ? `${prefixo}.${chave}` : chave;
      return [caminho, ...chavesDe(filho, caminho)];
    })
    .sort();
}

function haDias(dias: number, agora: number): string {
  return new Date(agora - dias * UM_DIA_MS).toISOString();
}

describe('painel público de indicadores', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let autorId: string;
  let orgaoId: number;
  let sequencia = 0;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    await aplicarCargaInicial(prisma);
    orgaoId = (await prisma.orgao.findFirstOrThrow({ where: { municipioId: SOROCABA } })).id;

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    autorId = (
      await prisma.usuario.create({
        data: {
          nome: 'Autora Secreta',
          apelidoPublico: 'autora',
          email: 'autora.secreta@exemplo.test',
          papel: 'CIDADAO',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    const chaves = [...(await redis.keys('limite:*')), ...(await redis.keys('painel:*'))];
    if (chaves.length) await redis.del(...chaves);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function inserir(nova: NovaOcorrencia): Promise<string> {
    const id = randomUUID();
    sequencia += 1;
    const protocolo = `FA-2026-SOR-${String(sequencia).padStart(6, '0')}`;
    // A mesma referência para as duas datas, para o tempo de atendimento sair exato.
    const agora = Date.now();
    const resolvidaEm = nova.resolvidaHa === undefined ? null : haDias(nova.resolvidaHa, agora);
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em, resolvida_em)
      VALUES (${id}::uuid, ${protocolo}, ${autorId}::uuid,
              (SELECT id FROM categoria WHERE slug = ${nova.categoria ?? 'iluminacao'}),
              ${SOROCABA}, ${orgaoId}, 'Poste apagado há uma semana na esquina',
              ST_SetSRID(ST_MakePoint(-47.4526::float8, -23.5015::float8), 4326)::geography,
              'Rua A, 1 · Centro', ${nova.status ?? 'RECEBIDA'}::status_ocorrencia,
              ${haDias(nova.criadaHa, agora)}::timestamptz, ${resolvidaEm}::timestamptz)`;
    return id;
  }

  /**
   * Ocorrências espalhadas pelos três períodos, com recusadas e duplicadas (que não contam)
   * e resolvidas com tempos de atendimento diferentes.
   */
  async function inserirCenario(): Promise<void> {
    // Últimos 30 dias.
    await inserir({ categoria: 'iluminacao', status: 'RECEBIDA', criadaHa: 5 });
    await inserir({ categoria: 'iluminacao', status: 'RESOLVIDA', criadaHa: 10, resolvidaHa: 7 });
    await inserir({
      categoria: 'iluminacao',
      status: 'RESOLVIDA',
      criadaHa: 20,
      resolvidaHa: 19.5,
    });
    await inserir({ categoria: 'iluminacao', status: 'RECUSADA', criadaHa: 3 });
    await inserir({ categoria: 'iluminacao', status: 'DUPLICADA', criadaHa: 4 });
    await inserir({ categoria: 'pavimentacao', status: 'EM_EXECUCAO', criadaHa: 25 });
    // De 31 a 90 dias.
    await inserir({ categoria: 'pavimentacao', status: 'EM_ANALISE', criadaHa: 40 });
    await inserir({
      categoria: 'pavimentacao',
      status: 'RESOLVIDA',
      criadaHa: 60,
      resolvidaHa: 50,
    });
    await inserir({ categoria: 'limpeza-urbana', status: 'RECUSADA', criadaHa: 70 });
    // De 91 a 365 dias.
    await inserir({
      categoria: 'agua-esgoto',
      status: 'RESOLVIDA',
      criadaHa: 100,
      resolvidaHa: 99,
    });
    await inserir({
      categoria: 'limpeza-urbana',
      status: 'RESOLVIDA',
      criadaHa: 200,
      resolvidaHa: 190,
    });
    await inserir({ categoria: 'limpeza-urbana', status: 'RECEBIDA', criadaHa: 300 });
    // Fora de todos os períodos.
    await inserir({ categoria: 'agua-esgoto', status: 'RECEBIDA', criadaHa: 400 });
    await inserir({ categoria: 'iluminacao', status: 'RESOLVIDA', criadaHa: 500, resolvidaHa: 1 });
  }

  function get(caminho: string) {
    return app.inject({ method: 'GET', url: `/${PREFIXO_API}${caminho}` });
  }

  async function painel(consulta = ''): Promise<Painel> {
    const resposta = await get(`/indicadores/painel${consulta}`);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Painel>();
  }

  interface Contagem {
    slug: string;
    total: number;
    resolvidas: number;
  }

  /** Contagem direta no banco, escrita à parte da consulta da API. */
  async function contarNoBanco(dias: number, categorias: string[] | null) {
    const porCategoria = await prisma.$queryRaw<Contagem[]>`
      SELECT c.slug, count(*)::int AS total,
             count(*) FILTER (WHERE o.status = 'RESOLVIDA')::int AS resolvidas
      FROM ocorrencia o JOIN categoria c ON c.id = o.categoria_id
      WHERE o.status NOT IN ('RECUSADA', 'DUPLICADA')
        AND o.criada_em >= now() - make_interval(days => ${dias}::int)
        AND (${categorias}::text[] IS NULL OR c.slug = ANY(${categorias}::text[]))
      GROUP BY c.slug ORDER BY c.slug`;
    const [geral] = await prisma.$queryRaw<
      { total: number; resolvidas: number; pct: string | null; mediana: string | null }[]
    >`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE o.status = 'RESOLVIDA')::int AS resolvidas,
             round(100.0 * count(*) FILTER (WHERE o.status = 'RESOLVIDA')
                   / nullif(count(*), 0), 1)::text AS pct,
             round((percentile_cont(0.5) WITHIN GROUP (
                     ORDER BY extract(epoch FROM o.resolvida_em - o.criada_em) / 86400)
                   FILTER (WHERE o.status = 'RESOLVIDA'))::numeric, 1)::text AS mediana
      FROM ocorrencia o JOIN categoria c ON c.id = o.categoria_id
      WHERE o.status NOT IN ('RECUSADA', 'DUPLICADA')
        AND o.criada_em >= now() - make_interval(days => ${dias}::int)
        AND (${categorias}::text[] IS NULL OR c.slug = ANY(${categorias}::text[]))`;
    return {
      total: geral!.total,
      resolvidas: geral!.resolvidas,
      resolvidasPct: geral!.pct === null ? null : Number(geral!.pct),
      diasMediana: geral!.mediana === null ? null : Number(geral!.mediana),
      porCategoria: porCategoria,
    };
  }

  describe('números batem com a contagem direta no banco', () => {
    it.each([
      { consulta: '?periodo=30', dias: 30, categorias: null, total: 4 },
      { consulta: '?periodo=90', dias: 90, categorias: null, total: 6 },
      { consulta: '?periodo=365', dias: 365, categorias: null, total: 9 },
      {
        consulta: '?periodo=90&categoria=iluminacao',
        dias: 90,
        categorias: ['iluminacao'],
        total: 3,
      },
      {
        consulta: `?periodo=365&categoria=pavimentacao,limpeza-urbana&municipio=${SOROCABA}`,
        dias: 365,
        categorias: ['limpeza-urbana', 'pavimentacao'],
        total: 5,
      },
    ])('$consulta', async ({ consulta, dias, categorias, total }) => {
      await inserirCenario();

      const resposta = await painel(consulta);
      const banco = await contarNoBanco(dias, categorias);

      expect(banco.total).toBe(total);
      expect(resposta.vazio).toBe(false);
      expect(resposta.periodo_dias).toBe(dias);
      expect(resposta.total).toBe(banco.total);
      expect(resposta.resolvidas).toBe(banco.resolvidas);
      expect(resposta.resolvidas_pct).toBe(banco.resolvidasPct);
      expect(resposta.dias_mediana).toBe(banco.diasMediana);
      expect(
        resposta.por_categoria
          .map(({ slug, total: t, resolvidas }) => ({ slug, total: t, resolvidas }))
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      ).toEqual(banco.porCategoria);
    });

    it('nos últimos 30 dias: 4 visíveis, 2 resolvidas (50%), mediana de 1,8 dia', async () => {
      await inserirCenario();

      const resposta = await painel('?periodo=30');

      expect(resposta).toMatchObject({
        total: 4,
        resolvidas: 2,
        resolvidas_pct: 50,
        // 3 dias e meio dia: a mediana de dois valores é a média.
        dias_mediana: 1.8,
      });
      expect(resposta.por_categoria).toEqual([
        { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', total: 3, resolvidas: 2 },
        { slug: 'pavimentacao', nome: 'Pavimentação', icone: 'add_road', total: 1, resolvidas: 0 },
      ]);
    });

    it('sem período, usa os últimos 30 dias', async () => {
      await inserirCenario();
      expect((await painel()).periodo_dias).toBe(30);
      expect((await painel()).total).toBe(4);
    });
  });

  describe('período sem dados', () => {
    it('devolve vazio: true, sem percentual nem mediana zerados', async () => {
      await inserir({ categoria: 'agua-esgoto', status: 'RECEBIDA', criadaHa: 400 });
      await inserir({ categoria: 'iluminacao', status: 'RECUSADA', criadaHa: 2 });

      const resposta = await painel('?periodo=365');

      expect(resposta).toMatchObject({
        vazio: true,
        periodo_dias: 365,
        total: 0,
        resolvidas: 0,
        resolvidas_pct: null,
        dias_mediana: null,
        por_categoria: [],
      });
    });

    it('categoria sem ocorrências no período também fica vazia', async () => {
      await inserirCenario();
      const resposta = await painel('?periodo=30&categoria=agua-esgoto');
      expect(resposta.vazio).toBe(true);
      expect(resposta.resolvidas_pct).toBeNull();
    });

    it('com ocorrências mas nenhuma resolvida, a mediana fica nula e o percentual é 0', async () => {
      await inserir({ categoria: 'iluminacao', status: 'RECEBIDA', criadaHa: 1 });
      const resposta = await painel('?periodo=30');
      expect(resposta).toMatchObject({ vazio: false, resolvidas_pct: 0, dias_mediana: null });
    });
  });

  describe('dado pessoal', () => {
    it('abre sem login e as chaves da resposta não têm autor, nome, e-mail ou apelido', async () => {
      await inserirCenario();

      const resposta = await get('/indicadores/painel?periodo=365');

      expect(resposta.statusCode).toBe(200);
      expect(chavesDe(resposta.json())).toEqual(
        [
          'calculado_em',
          'dias_mediana',
          'periodo_dias',
          'por_categoria',
          'por_categoria.icone',
          'por_categoria.nome',
          'por_categoria.resolvidas',
          'por_categoria.slug',
          'por_categoria.total',
          'resolvidas',
          'resolvidas_pct',
          'total',
          'vazio',
        ].sort(),
      );
      expect(resposta.body).not.toContain(autorId);
      expect(resposta.body).not.toContain('autora.secreta@exemplo.test');
      expect(resposta.body).not.toContain('Autora Secreta');
      expect(resposta.body).not.toMatch(/autor|email|apelido/);
    });
  });

  describe('cache de 5 minutos', () => {
    it('a segunda chamada com os mesmos filtros não consulta o banco', async () => {
      await inserirCenario();
      const consultas = app.get<ConsultasPainel>(CONSULTAS_PAINEL);
      const contar = vi.spyOn(consultas, 'contar');

      const primeira = await painel('?periodo=30');
      // Uma ocorrência nova não aparece enquanto o painel guardado vale.
      await inserir({ categoria: 'iluminacao', status: 'RECEBIDA', criadaHa: 1 });
      const segunda = await painel('?periodo=30');

      expect(contar).toHaveBeenCalledTimes(1);
      expect(segunda).toEqual(primeira);
      expect(segunda.total).toBe(4);

      const validade = await redis.ttl('painel:todos:30:todas');
      expect(validade).toBeGreaterThan(0);
      expect(validade).toBeLessThanOrEqual(300);
    });

    it('cada combinação de filtros tem a sua chave, e a ordem das categorias não importa', async () => {
      await inserirCenario();
      const consultas = app.get<ConsultasPainel>(CONSULTAS_PAINEL);
      const contar = vi.spyOn(consultas, 'contar');

      const geral = await painel('?periodo=30');
      await inserir({ categoria: 'iluminacao', status: 'RECEBIDA', criadaHa: 1 });

      // Outra combinação: calcula de novo e já enxerga a ocorrência nova.
      const outroPeriodo = await painel('?periodo=90');
      const comCategorias = await painel('?periodo=30&categoria=pavimentacao,iluminacao');
      const mesmaOrdemInvertida = await painel('?periodo=30&categoria=iluminacao,pavimentacao');
      const comMunicipio = await painel(`?periodo=30&municipio=${SOROCABA}`);

      expect(geral.total).toBe(4);
      expect(outroPeriodo.total).toBe(7);
      expect(comCategorias.total).toBe(5);
      expect(mesmaOrdemInvertida).toEqual(comCategorias);
      expect(comMunicipio.total).toBe(5);
      expect(contar).toHaveBeenCalledTimes(4);
      expect((await redis.keys('painel:*')).sort()).toEqual([
        'painel:3552205:30:todas',
        'painel:todos:30:iluminacao,pavimentacao',
        'painel:todos:30:todas',
        'painel:todos:90:todas',
      ]);
    });

    it('vencido o cache, o painel é calculado de novo', async () => {
      await inserirCenario();
      expect((await painel('?periodo=30')).total).toBe(4);
      await inserir({ categoria: 'iluminacao', status: 'RECEBIDA', criadaHa: 1 });

      await redis.del('painel:todos:30:todas');

      expect((await painel('?periodo=30')).total).toBe(5);
    });
  });

  describe('validação', () => {
    it.each([
      ['?periodo=7', 'periodo'],
      ['?periodo=abc', 'periodo'],
      ['?categoria=Ilumina%C3%A7%C3%A3o', 'categoria'],
      ['?municipio=abc', 'municipio'],
    ])('%s: 422 VALIDACAO no campo %s', async (consulta, campo) => {
      const resposta = await get(`/indicadores/painel${consulta}`);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { [campo]: expect.any(Array) as unknown[] } },
      });
    });
  });
});
