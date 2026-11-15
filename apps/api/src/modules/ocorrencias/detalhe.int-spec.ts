import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import type { StatusOcorrencia } from './domain/ocorrencia.js';

const SOROCABA = 3552205;
const UM_DIA_MS = 24 * 60 * 60 * 1000;
/** Apelido fácil de achar em qualquer parte da resposta. */
const APELIDO_MARIA = 'MariaDoBairroXYZ';
const CAMPOS_PESSOAIS = [
  'minha_confirmacao',
  'pode_confirmar',
  'pode_avaliar',
  'pode_reabrir',
  'prazo_pos_resolucao_ate',
];

interface Detalhe {
  id: string;
  protocolo: string;
  status_publico: string;
  descricao: string;
  resumo: string;
  confirmacoes: number;
  fotos: { url: string; miniatura_url: string | null }[];
  linha_do_tempo: { etapa: string; data: string }[];
  respostas: { orgao: string; comentario: string; data: string }[];
  reaberturas: { justificativa: string; data: string }[];
  justificativa_recusa: string | null;
  original: { id: string; protocolo: string } | null;
  autor_apelido?: string;
  minha_confirmacao?: boolean;
  pode_confirmar?: boolean;
  pode_avaliar?: boolean;
  pode_reabrir?: boolean;
  prazo_pos_resolucao_ate?: string | null;
}

interface Minhas {
  itens: {
    id: string;
    status_publico: string;
    justificativa_recusa: string | null;
    original: { id: string; protocolo: string } | null;
  }[];
  proximo_cursor: string | null;
}

interface NovaOcorrencia {
  autorId?: string;
  status?: StatusOcorrencia;
  publicarAutor?: boolean;
  criadaEm?: Date;
  resolvidaEm?: Date | null;
  duplicadaDeId?: string | null;
}

/** Todas as chaves e valores de texto da resposta, em qualquer profundidade. */
function textosDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(textosDe);
  if (typeof valor === 'string') return [valor];
  if (typeof valor !== 'object' || valor === null) return [];
  return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...textosDe(filho)]);
}

describe('detalhe e minhas ocorrências', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let urlFotos: string;
  let orgaoId: number;
  let orgaoNome: string;
  let sequencia = 0;
  const tokens: Record<'maria' | 'joao' | 'ana', string> = { maria: '', joao: '', ana: '' };
  const ids: Record<'maria' | 'joao' | 'ana', string> = { maria: '', joao: '', ana: '' };

  async function cadastrar(nome: 'maria' | 'joao' | 'ana', apelido: string): Promise<void> {
    const resposta = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/cadastro`,
      payload: {
        nome: `Pessoa ${nome}`,
        apelido_publico: apelido,
        email: `${nome}@exemplo.test`,
        senha: 'senha-forte-1',
        politica_versao: '1',
      },
    });
    const corpo = resposta.json<{ access_token: string; usuario: { id: string } }>();
    tokens[nome] = corpo.access_token;
    ids[nome] = corpo.usuario.id;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    urlFotos = app.get<Ambiente>(AMBIENTE).R2_URL_PUBLICA;
    await aplicarCargaInicial(prisma);
    const orgao = await prisma.orgao.findFirstOrThrow({ where: { municipioId: SOROCABA } });
    orgaoId = orgao.id;
    orgaoNome = orgao.nome;

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await limparLimites();
    await cadastrar('maria', APELIDO_MARIA);
    await cadastrar('joao', 'joao');
    await cadastrar('ana', 'ana');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await limparLimites();
  });

  async function limparLimites(): Promise<void> {
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
  }

  async function inserir(nova: NovaOcorrencia = {}): Promise<{ id: string; protocolo: string }> {
    const id = randomUUID();
    sequencia += 1;
    const protocolo = `FA-2026-SOR-${String(sequencia).padStart(6, '0')}`;
    const criadaEm = nova.criadaEm ?? new Date();
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, publicar_autor, categoria_id, municipio_id,
                              orgao_id, descricao, local, endereco, status, duplicada_de_id,
                              criada_em, resolvida_em)
      VALUES (${id}::uuid, ${protocolo}, ${nova.autorId ?? ids.maria}::uuid,
              ${nova.publicarAutor ?? false},
              (SELECT id FROM categoria WHERE slug = 'iluminacao'), ${SOROCABA}, ${orgaoId},
              'Poste apagado há uma semana na esquina',
              ST_SetSRID(ST_MakePoint(-47.4526, -23.5015), 4326)::geography,
              'Rua A, 1 · Centro', ${nova.status ?? 'RECEBIDA'}::status_ocorrencia,
              ${nova.duplicadaDeId ?? null}::uuid, ${criadaEm}, ${nova.resolvidaEm ?? null})`;
    await evento(id, null, 'RECEBIDA', criadaEm, null, nova.autorId ?? ids.maria);
    return { id, protocolo };
  }

  async function evento(
    ocorrenciaId: string,
    de: StatusOcorrencia | null,
    para: StatusOcorrencia,
    criadoEm: Date,
    comentario: string | null = null,
    autorId: string | null = null,
  ): Promise<void> {
    await prisma.ocorrenciaEvento.create({
      data: {
        ocorrenciaId,
        deStatus: de,
        paraStatus: para,
        comentario,
        criadoEm,
        autorId,
        // Sem autor, é o agente do órgão; com autor, o cidadão (criação e reabertura).
        orgaoId: autorId ? null : orgaoId,
      },
    });
  }

  function get(caminho: string, token?: string) {
    return app.inject({
      method: 'GET',
      url: `/${PREFIXO_API}${caminho}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  async function detalhe(id: string, token?: string): Promise<Detalhe> {
    const resposta = await get(`/ocorrencias/${id}`, token);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Detalhe>();
  }

  describe('GET /ocorrencias/:id', () => {
    it('uma recusada de outro autor dá 404; para o próprio autor, 200 com a justificativa', async () => {
      const { id } = await inserir({ status: 'RECUSADA' });
      await evento(id, 'RECEBIDA', 'RECUSADA', new Date(), 'Fora da competência do município');

      for (const token of [undefined, tokens.joao]) {
        const resposta = await get(`/ocorrencias/${id}`, token);
        expect(resposta.statusCode).toBe(404);
        expect(resposta.json()).toMatchObject({ codigo: 'NAO_ENCONTRADA' });
      }

      const daAutora = await detalhe(id, tokens.maria);
      expect(daAutora).toMatchObject({
        id,
        status_publico: 'RECUSADO',
        justificativa_recusa: 'Fora da competência do município',
      });
      expect(daAutora.linha_do_tempo.map((etapa) => etapa.etapa)).toEqual(['RECEBIDO', 'RECUSADO']);
    });

    it('uma duplicada só aparece para o autor, com o link para a original', async () => {
      const original = await inserir({ autorId: ids.ana });
      const { id } = await inserir({ status: 'DUPLICADA', duplicadaDeId: original.id });
      await evento(id, 'RECEBIDA', 'DUPLICADA', new Date());

      expect((await get(`/ocorrencias/${id}`, tokens.ana)).statusCode).toBe(404);
      expect(await detalhe(id, tokens.maria)).toMatchObject({
        status_publico: 'DUPLICADO',
        original: { id: original.id, protocolo: original.protocolo },
      });
    });

    it('com publicar_autor = false, nenhuma chave ou valor da resposta contém o apelido', async () => {
      const escondida = await inserir({ publicarAutor: false });
      const publicada = await inserir({ publicarAutor: true });

      for (const token of [undefined, tokens.joao]) {
        const resposta = await detalhe(escondida.id, token);
        expect(resposta).not.toHaveProperty('autor_apelido');
        expect(textosDe(resposta).filter((texto) => texto.includes(APELIDO_MARIA))).toEqual([]);
        // Nada que identifique a autora, em nenhum caso.
        expect(textosDe(resposta).some((texto) => /autor_id|email|maria@/.test(texto))).toBe(false);
      }
      expect((await detalhe(publicada.id)).autor_apelido).toBe(APELIDO_MARIA);
    });

    it('visitante não recebe os campos pessoais; o logado recebe', async () => {
      const { id } = await inserir();

      const doVisitante = await detalhe(id);
      for (const campo of CAMPOS_PESSOAIS) expect(doVisitante).not.toHaveProperty(campo);

      expect(await detalhe(id, tokens.joao)).toMatchObject({
        minha_confirmacao: false,
        pode_confirmar: true,
        pode_avaliar: false,
        pode_reabrir: false,
        prazo_pos_resolucao_ate: null,
      });
      // A autora não confirma a própria.
      expect((await detalhe(id, tokens.maria)).pode_confirmar).toBe(false);
    });

    it('resolvida: autor e quem confirmou podem avaliar e reabrir; quem já avaliou, só reabrir', async () => {
      const resolvidaEm = new Date(Date.now() - 2 * UM_DIA_MS);
      const { id } = await inserir({ status: 'RESOLVIDA', resolvidaEm });
      await prisma.confirmacao.create({ data: { ocorrenciaId: id, usuarioId: ids.joao } });
      const prazo = new Date(resolvidaEm.getTime() + 10 * UM_DIA_MS).toISOString();

      for (const token of [tokens.maria, tokens.joao]) {
        expect(await detalhe(id, token)).toMatchObject({
          pode_avaliar: true,
          pode_reabrir: true,
          prazo_pos_resolucao_ate: prazo,
        });
      }
      expect(await detalhe(id, tokens.joao)).toMatchObject({ minha_confirmacao: true });
      expect(await detalhe(id, tokens.ana)).toMatchObject({
        pode_avaliar: false,
        pode_reabrir: false,
      });

      await prisma.avaliacao.create({ data: { ocorrenciaId: id, usuarioId: ids.joao, nota: 4 } });
      expect(await detalhe(id, tokens.joao)).toMatchObject({
        pode_avaliar: false,
        pode_reabrir: true,
      });
    });

    it('passados os 10 dias da resolução, nem avaliar nem reabrir', async () => {
      const resolvidaEm = new Date(Date.now() - 11 * UM_DIA_MS);
      const { id } = await inserir({ status: 'RESOLVIDA', resolvidaEm });
      expect(await detalhe(id, tokens.maria)).toMatchObject({
        pode_avaliar: false,
        pode_reabrir: false,
      });
    });

    it('mostra só as fotos aprovadas, a linha do tempo com a reabertura e as respostas do órgão', async () => {
      const criadaEm = new Date('2026-11-01T12:00:00Z');
      const dia = (n: number) => new Date(criadaEm.getTime() + n * UM_DIA_MS);
      const { id } = await inserir({ status: 'EM_ANALISE', criadaEm });
      await evento(id, 'RECEBIDA', 'EM_ANALISE', dia(1));
      await evento(id, 'EM_ANALISE', 'EM_EXECUCAO', dia(2), 'Equipe agendada');
      await evento(id, 'EM_EXECUCAO', 'RESOLVIDA', dia(3), 'Lâmpada trocada');
      await evento(id, 'RESOLVIDA', 'EM_ANALISE', dia(4), 'Apagou de novo à noite', ids.maria);
      await prisma.ocorrenciaFoto.createMany({
        data: [
          {
            ocorrenciaId: id,
            ordem: 1,
            moderacao: 'APROVADA',
            storageKey: `ocorrencias/${id}/1.jpg`,
            miniaturaKey: `ocorrencias/${id}/1-400.jpg`,
          },
          {
            ocorrenciaId: id,
            ordem: 2,
            moderacao: 'PENDENTE',
            uploadKey: `ocorrencias/${id}/2.jpg`,
          },
        ],
      });

      const resposta = await detalhe(id);
      expect(resposta).toMatchObject({
        status_publico: 'EM_ANDAMENTO',
        descricao: 'Poste apagado há uma semana na esquina',
        justificativa_recusa: null,
        original: null,
        fotos: [
          {
            url: `${urlFotos}/ocorrencias/${id}/1.jpg`,
            miniatura_url: `${urlFotos}/ocorrencias/${id}/1-400.jpg`,
          },
        ],
        linha_do_tempo: [
          { etapa: 'RECEBIDO', data: criadaEm.toISOString() },
          { etapa: 'EM_ANDAMENTO', data: dia(1).toISOString() },
          { etapa: 'RESOLVIDO', data: dia(3).toISOString() },
          { etapa: 'REABERTO', data: dia(4).toISOString() },
        ],
        respostas: [
          { orgao: orgaoNome, comentario: 'Equipe agendada', data: dia(2).toISOString() },
          { orgao: orgaoNome, comentario: 'Lâmpada trocada', data: dia(3).toISOString() },
        ],
        reaberturas: [{ justificativa: 'Apagou de novo à noite', data: dia(4).toISOString() }],
      });
    });

    it('id inexistente ou inválido dá 404; token inválido dá 401', async () => {
      expect((await get(`/ocorrencias/${randomUUID()}`)).statusCode).toBe(404);
      expect((await get('/ocorrencias/nao-e-uuid')).json()).toMatchObject({
        codigo: 'NAO_ENCONTRADA',
      });
      const { id } = await inserir();
      const resposta = await get(`/ocorrencias/${id}`, 'token-falso');
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'NAO_AUTENTICADO' });
    });
  });

  describe('GET /me/ocorrencias', () => {
    it('lista todas as do autor, com a justificativa da recusa e o link da original', async () => {
      const agora = Date.now();
      const original = await inserir({ autorId: ids.joao, criadaEm: new Date(agora - 4000) });
      const aberta = await inserir({ criadaEm: new Date(agora - 3000) });
      const recusada = await inserir({ status: 'RECUSADA', criadaEm: new Date(agora - 2000) });
      await evento(recusada.id, 'RECEBIDA', 'RECUSADA', new Date(), 'Endereço em área particular');
      const duplicada = await inserir({
        status: 'DUPLICADA',
        duplicadaDeId: original.id,
        criadaEm: new Date(agora - 1000),
      });

      const resposta = await get('/me/ocorrencias', tokens.maria);
      expect(resposta.statusCode).toBe(200);
      const { itens, proximo_cursor } = resposta.json<Minhas>();
      expect(proximo_cursor).toBeNull();
      expect(itens).toEqual([
        expect.objectContaining({
          id: duplicada.id,
          status_publico: 'DUPLICADO',
          justificativa_recusa: null,
          original: { id: original.id, protocolo: original.protocolo },
        }),
        expect.objectContaining({
          id: recusada.id,
          status_publico: 'RECUSADO',
          justificativa_recusa: 'Endereço em área particular',
          original: null,
        }),
        expect.objectContaining({ id: aberta.id, status_publico: 'RECEBIDO', original: null }),
      ]);
    });

    it('pagina por cursor sem repetir nem pular', async () => {
      const agora = Date.now();
      const criadas = [];
      for (let i = 0; i < 5; i += 1) {
        criadas.push((await inserir({ criadaEm: new Date(agora - i * 1000) })).id);
      }
      const vistos: string[] = [];
      let cursor: string | null = null;
      do {
        const consulta: string = `?limite=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const pagina: Minhas = (await get(`/me/ocorrencias${consulta}`, tokens.maria)).json();
        vistos.push(...pagina.itens.map((item) => item.id));
        cursor = pagina.proximo_cursor;
      } while (cursor);
      expect(vistos).toEqual(criadas);
    });

    it('sem login dá 401', async () => {
      expect((await get('/me/ocorrencias')).statusCode).toBe(401);
    });
  });
});
