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
const CENTRO = { lat: -23.5015, lng: -47.4526 };
/** Área em volta do centro de Sorocaba: minLng,minLat,maxLng,maxLat. */
const BBOX_CENTRO = '-47.47,-23.52,-47.43,-23.48';

interface Card {
  id: string;
  protocolo: string;
  status_publico: string;
  categoria: { slug: string; nome: string; icone: string };
  resumo: string;
  endereco: string | null;
  confirmacoes: number;
  urgente: boolean;
  dias_em_aberto: number;
  miniatura_url: string | null;
  foto_em_analise: boolean;
  criada_em: string;
}

interface Feed {
  itens: Card[];
  proximo_cursor: string | null;
}

interface Mapa {
  pontos: {
    id: string;
    lat: number;
    lng: number;
    status_publico: string;
    categoria_slug: string;
    urgente: boolean;
  }[];
  truncado: boolean;
}

interface NovaOcorrencia {
  status?: StatusOcorrencia;
  categoria?: string;
  /** Aceita microssegundos: '2026-11-10T12:00:00.123456Z'. */
  criadaEm?: string;
  resolvidaEm?: string;
  local?: { lat: number; lng: number };
  descricao?: string;
}

/** Todas as chaves de um objeto, com o caminho: ['categoria', 'categoria.slug', ...]. */
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

describe('feed e mapa públicos', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let urlFotos: string;
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
    urlFotos = app.get<Ambiente>(AMBIENTE).R2_URL_PUBLICA;
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
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
  });

  async function inserir(nova: NovaOcorrencia = {}): Promise<string> {
    const id = randomUUID();
    sequencia += 1;
    const protocolo = `FA-2026-SOR-${String(sequencia).padStart(6, '0')}`;
    const local = nova.local ?? CENTRO;
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em, resolvida_em)
      VALUES (${id}::uuid, ${protocolo}, ${autorId}::uuid,
              (SELECT id FROM categoria WHERE slug = ${nova.categoria ?? 'iluminacao'}),
              ${SOROCABA}, ${orgaoId}, ${nova.descricao ?? 'Poste apagado há uma semana na esquina'},
              ST_SetSRID(ST_MakePoint(${local.lng}::float8, ${local.lat}::float8), 4326)::geography,
              'Rua A, 1 · Centro', ${nova.status ?? 'RECEBIDA'}::status_ocorrencia,
              ${nova.criadaEm ?? new Date().toISOString()}::timestamptz,
              ${nova.resolvidaEm ?? null}::timestamptz)`;
    return id;
  }

  async function confirmarPor(ocorrenciaId: string, pessoas: number): Promise<void> {
    await prisma.$executeRaw`
      WITH novos AS (
        INSERT INTO usuario (nome, apelido_publico, email, papel)
        SELECT 'Vizinho', 'vizinho', 'vizinho-' || gen_random_uuid() || '@exemplo.test', 'CIDADAO'
        FROM generate_series(1, ${pessoas}::int)
        RETURNING id
      )
      INSERT INTO confirmacao (ocorrencia_id, usuario_id) SELECT ${ocorrenciaId}::uuid, id FROM novos`;
  }

  function get(caminho: string) {
    return app.inject({ method: 'GET', url: `/${PREFIXO_API}${caminho}` });
  }

  async function feed(consulta = ''): Promise<Feed> {
    const resposta = await get(`/ocorrencias${consulta}`);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Feed>();
  }

  async function mapa(consulta: string): Promise<Mapa> {
    const resposta = await get(`/ocorrencias/mapa${consulta}`);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Mapa>();
  }

  async function todasAsPaginas(limite: number): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const pagina: Feed = await feed(
        `?limite=${limite}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      ids.push(...pagina.itens.map((card) => card.id));
      cursor = pagina.proximo_cursor;
    } while (cursor);
    return ids;
  }

  describe('visibilidade', () => {
    it('abre sem login; RECUSADA e DUPLICADA não aparecem no feed nem no mapa', async () => {
      const visiveis = [
        await inserir({ status: 'RECEBIDA' }),
        await inserir({ status: 'EM_ANALISE' }),
        await inserir({ status: 'EM_EXECUCAO' }),
        await inserir({ status: 'RESOLVIDA', resolvidaEm: new Date().toISOString() }),
      ];
      const original = visiveis[0]!;
      await inserir({ status: 'RECUSADA' });
      const duplicada = await inserir({ status: 'DUPLICADA' });
      await prisma.ocorrencia.update({
        where: { id: duplicada },
        data: { duplicadaDeId: original },
      });

      const ids = (await feed()).itens.map((card) => card.id);
      const pontos = (await mapa(`?bbox=${BBOX_CENTRO}`)).pontos.map((ponto) => ponto.id);

      expect(ids.sort()).toEqual([...visiveis].sort());
      expect(pontos.sort()).toEqual([...visiveis].sort());
    });

    it('mostra o status como aparece no app', async () => {
      await inserir({ status: 'EM_EXECUCAO' });
      const [card] = (await feed()).itens;
      const [ponto] = (await mapa(`?bbox=${BBOX_CENTRO}`)).pontos;
      expect(card!.status_publico).toBe('EM_ANDAMENTO');
      expect(ponto!.status_publico).toBe('EM_ANDAMENTO');
    });
  });

  describe('filtros', () => {
    beforeEach(async () => {
      await inserir({ categoria: 'iluminacao', status: 'RECEBIDA' });
      await inserir({ categoria: 'iluminacao', status: 'EM_ANALISE' });
      await inserir({ categoria: 'iluminacao', status: 'RESOLVIDA' });
      await inserir({ categoria: 'pavimentacao', status: 'RESOLVIDA' });
      await inserir({ categoria: 'pavimentacao', status: 'EM_EXECUCAO' });
      await inserir({ categoria: 'limpeza-urbana', status: 'RECEBIDA' });
    });

    function combinacoes(cards: { categoria: string; status: string }[]): string[] {
      return cards.map((card) => `${card.categoria}:${card.status}`).sort();
    }

    it('categoria + status: só o que atende aos dois', async () => {
      const { itens } = await feed('?categoria=iluminacao&status=RESOLVIDO');
      expect(itens).toHaveLength(1);
      expect(itens[0]).toMatchObject({
        categoria: { slug: 'iluminacao' },
        status_publico: 'RESOLVIDO',
      });
    });

    it('listas em cada filtro, e "em andamento" cobre análise e execução', async () => {
      const { itens } = await feed('?categoria=iluminacao,pavimentacao&status=EM_ANDAMENTO');
      expect(
        combinacoes(
          itens.map((card) => ({ categoria: card.categoria.slug, status: card.status_publico })),
        ),
      ).toEqual(['iluminacao:EM_ANDAMENTO', 'pavimentacao:EM_ANDAMENTO']);
    });

    it('aceita o filtro repetido na URL', async () => {
      const { itens } = await feed('?status=RECEBIDO&status=RESOLVIDO&categoria=pavimentacao');
      expect(itens).toHaveLength(1);
      expect(itens[0]!.status_publico).toBe('RESOLVIDO');
    });

    it('município: o de Sorocaba traz tudo, outro não traz nada', async () => {
      expect((await feed(`?municipio=${SOROCABA}`)).itens).toHaveLength(6);
      expect((await feed('?municipio=3550308')).itens).toHaveLength(0);
    });

    it('o mapa aceita os mesmos filtros', async () => {
      const { pontos } = await mapa(
        `?bbox=${BBOX_CENTRO}&categoria=iluminacao,limpeza-urbana&status=RECEBIDO`,
      );
      expect(
        combinacoes(
          pontos.map((ponto) => ({
            categoria: ponto.categoria_slug,
            status: ponto.status_publico,
          })),
        ),
      ).toEqual(['iluminacao:RECEBIDO', 'limpeza-urbana:RECEBIDO']);
    });

    it('filtro sem resultado devolve lista vazia', async () => {
      expect(await feed('?categoria=agua-esgoto')).toEqual({ itens: [], proximo_cursor: null });
    });

    it.each([
      ['?status=ABERTO', 'status'],
      ['?status=RECUSADA', 'status'],
      ['?categoria=Ilumina%C3%A7%C3%A3o', 'categoria'],
      ['?limite=0', 'limite'],
      ['?limite=51', 'limite'],
      ['?municipio=abc', 'municipio'],
      ['?cursor=nao-e-cursor', 'cursor'],
    ])('%s: 422 VALIDACAO no campo %s', async (consulta, campo) => {
      const resposta = await get(`/ocorrencias${consulta}`);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { [campo]: expect.any(Array) as unknown[] } },
      });
    });
  });

  describe('paginação por cursor', () => {
    it('da mais recente para a mais antiga, sem repetir nem pular', async () => {
      const ids: string[] = [];
      for (let dia = 1; dia <= 7; dia++) {
        ids.unshift(await inserir({ criadaEm: `2026-11-0${dia}T12:00:00Z` }));
      }

      expect(await todasAsPaginas(3)).toEqual(ids);
      expect((await feed('?limite=7')).proximo_cursor).toBeNull();
    });

    it('inserções entre as páginas não repetem nem pulam itens', async () => {
      const originais: string[] = [];
      for (let dia = 1; dia <= 6; dia++) {
        originais.unshift(await inserir({ criadaEm: `2026-11-0${dia}T12:00:00Z` }));
      }

      const vistos: string[] = [];
      let cursor: string | null = null;
      do {
        const pagina: Feed = await feed(
          `?limite=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        );
        vistos.push(...pagina.itens.map((card) => card.id));
        cursor = pagina.proximo_cursor;
        // Alguém registra uma ocorrência nova enquanto a pessoa rola o feed.
        await inserir();
        await inserir();
      } while (cursor);

      expect(vistos).toEqual(originais);
    });

    it('empate na data: desempata pelo id, sem perder nenhum', async () => {
      const mesmaHora = '2026-11-05T12:00:00Z';
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await inserir({ criadaEm: mesmaHora }));

      const paginado = await todasAsPaginas(2);
      expect(paginado).toHaveLength(5);
      expect([...paginado].sort()).toEqual([...ids].sort());
      expect(paginado).toEqual([...ids].sort().reverse());
    });

    it('datas que diferem só nos microssegundos não se perdem na virada da página', async () => {
      const mais = await inserir({ criadaEm: '2026-11-05T12:00:00.123456Z' });
      const menos = await inserir({ criadaEm: '2026-11-05T12:00:00.123455Z' });
      const antes = await inserir({ criadaEm: '2026-11-05T12:00:00.123Z' });

      expect(await todasAsPaginas(1)).toEqual([mais, menos, antes]);
    });

    it('limite padrão de 20', async () => {
      for (let i = 0; i < 21; i++) await inserir();
      const pagina = await feed();
      expect(pagina.itens).toHaveLength(20);
      expect(pagina.proximo_cursor).not.toBeNull();
    });
  });

  describe('card', () => {
    it('foto PENDENTE: miniatura_url null e foto_em_analise true', async () => {
      const id = await inserir();
      await prisma.ocorrenciaFoto.create({
        data: { ocorrenciaId: id, ordem: 1, uploadKey: `ocorrencias/${id}/1-x.jpg` },
      });

      const [card] = (await feed()).itens;
      expect(card).toMatchObject({ miniatura_url: null, foto_em_analise: true });
    });

    it('foto REJEITADA nunca aparece, nem com a miniatura ainda gravada', async () => {
      const id = await inserir();
      await prisma.ocorrenciaFoto.create({
        data: {
          ocorrenciaId: id,
          ordem: 1,
          storageKey: `ocorrencias/${id}/rejeitada.jpg`,
          miniaturaKey: `ocorrencias/${id}/rejeitada-400.jpg`,
          moderacao: 'REJEITADA',
        },
      });

      const [card] = (await feed()).itens;
      expect(card).toMatchObject({ miniatura_url: null, foto_em_analise: true });
    });

    it('foto aprovada: miniatura da primeira foto aprovada no storage público', async () => {
      const id = await inserir();
      await prisma.ocorrenciaFoto.createMany({
        data: [
          { ocorrenciaId: id, ordem: 1, uploadKey: `ocorrencias/${id}/1-x.jpg` },
          {
            ocorrenciaId: id,
            ordem: 2,
            storageKey: `ocorrencias/${id}/f2.jpg`,
            miniaturaKey: `ocorrencias/${id}/f2-400.jpg`,
            moderacao: 'APROVADA',
          },
        ],
      });

      const [card] = (await feed()).itens;
      expect(card).toMatchObject({
        miniatura_url: `${urlFotos}/ocorrencias/${id}/f2-400.jpg`,
        foto_em_analise: false,
      });
    });

    it('URGENTE com 10 confirmações; com 9, não', async () => {
      const dez = await inserir({ criadaEm: '2026-11-02T12:00:00Z' });
      const nove = await inserir({ criadaEm: '2026-11-01T12:00:00Z' });
      await confirmarPor(dez, 10);
      await confirmarPor(nove, 9);

      const { itens } = await feed();
      expect(itens.map((card) => [card.confirmacoes, card.urgente])).toEqual([
        [10, true],
        [9, false],
      ]);
      const { pontos } = await mapa(`?bbox=${BBOX_CENTRO}`);
      expect(Object.fromEntries(pontos.map((ponto) => [ponto.id, ponto.urgente]))).toEqual({
        [dez]: true,
        [nove]: false,
      });
    });

    it('dias em aberto: até hoje se aberta, até a resolução se resolvida', async () => {
      const dia = 24 * 60 * 60 * 1000;
      const agora = Date.now();
      await inserir({ criadaEm: new Date(agora - 3 * dia).toISOString() });
      await inserir({
        status: 'RESOLVIDA',
        criadaEm: new Date(agora - 30 * dia).toISOString(),
        resolvidaEm: new Date(agora - 25 * dia).toISOString(),
      });

      const { itens } = await feed();
      expect(itens.map((card) => card.dias_em_aberto)).toEqual([3, 5]);
    });

    it('resumo com até 120 caracteres da descrição', async () => {
      await inserir({ descricao: 'Calçada quebrada '.repeat(20).trim() });
      const [card] = (await feed()).itens;
      expect(card!.resumo.length).toBeLessThanOrEqual(120);
      expect(card!.resumo.startsWith('Calçada quebrada')).toBe(true);
    });

    it('as chaves da resposta são só as do card, sem autor nem e-mail', async () => {
      await inserir();
      const resposta = await get('/ocorrencias');
      const corpo = resposta.body;

      expect(chavesDe(resposta.json())).toEqual(
        [
          'itens',
          'itens.categoria',
          'itens.categoria.icone',
          'itens.categoria.nome',
          'itens.categoria.slug',
          'itens.confirmacoes',
          'itens.criada_em',
          'itens.dias_em_aberto',
          'itens.endereco',
          'itens.foto_em_analise',
          'itens.id',
          'itens.miniatura_url',
          'itens.protocolo',
          'itens.resumo',
          'itens.status_publico',
          'itens.urgente',
          'proximo_cursor',
        ].sort(),
      );
      expect(corpo).not.toContain(autorId);
      expect(corpo).not.toContain('autora.secreta@exemplo.test');
      expect(corpo).not.toContain('Autora Secreta');
      expect(corpo).not.toMatch(/autor|email/);
    });
  });

  describe('mapa', () => {
    async function inserirEmMassa(quantidade: number): Promise<void> {
      // Uma grade de pontos em volta do centro de Sorocaba, um segundo de diferença entre eles.
      await prisma.$executeRaw`
        INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                                descricao, local, status, criada_em)
        SELECT gen_random_uuid(), 'FA-2025-SOR-' || lpad(g::text, 6, '0'), ${autorId}::uuid,
               (SELECT id FROM categoria WHERE slug = 'iluminacao'), ${SOROCABA}, ${orgaoId},
               'Poste apagado na rua de cima',
               ST_SetSRID(ST_MakePoint(-47.46 + (g % 50) * 0.0004, -23.51 + (g / 50) * 0.0004),
                          4326)::geography,
               'RECEBIDA', now() - g * interval '1 second'
        FROM generate_series(1, ${quantidade}::int) g`;
    }

    it('com 2500 pontos na área, devolve 2000 e truncado true', async () => {
      await inserirEmMassa(2500);

      const resultado = await mapa(`?bbox=${BBOX_CENTRO}`);
      expect(resultado.pontos).toHaveLength(2000);
      expect(resultado.truncado).toBe(true);
      expect(new Set(resultado.pontos.map((ponto) => ponto.id)).size).toBe(2000);
    });

    it('até 2000 pontos, truncado false', async () => {
      await inserirEmMassa(2000);

      const resultado = await mapa(`?bbox=${BBOX_CENTRO}`);
      expect(resultado.pontos).toHaveLength(2000);
      expect(resultado.truncado).toBe(false);
    });

    it('só os pontos dentro da área, com a posição pública', async () => {
      const dentro = await inserir({ local: CENTRO });
      await inserir({ local: { lat: -23.45, lng: -47.4526 } });
      await inserir({ local: { lat: -23.5015, lng: -47.5 } });

      const resultado = await mapa(`?bbox=${BBOX_CENTRO}`);
      expect(resultado).toEqual({
        pontos: [
          {
            id: dentro,
            lat: expect.closeTo(CENTRO.lat, 6) as number,
            lng: expect.closeTo(CENTRO.lng, 6) as number,
            status_publico: 'RECEBIDO',
            categoria_slug: 'iluminacao',
            urgente: false,
          },
        ],
        truncado: false,
      });
    });

    it('as chaves dos pontos não têm autor nem e-mail', async () => {
      await inserir();
      const resposta = await get(`/ocorrencias/mapa?bbox=${BBOX_CENTRO}`);
      expect(chavesDe(resposta.json())).toEqual(
        [
          'pontos',
          'pontos.categoria_slug',
          'pontos.id',
          'pontos.lat',
          'pontos.lng',
          'pontos.status_publico',
          'pontos.urgente',
          'truncado',
        ].sort(),
      );
      expect(resposta.body).not.toContain(autorId);
    });

    it.each([
      [''],
      ['?bbox='],
      ['?bbox=-47.47,-23.52,-47.43'],
      ['?bbox=a,b,c,d'],
      ['?bbox=-47.43,-23.52,-47.47,-23.48'],
      ['?bbox=-200,-23.52,-47.43,-23.48'],
    ])('bbox inválida (%s): 422 BBOX_INVALIDA', async (consulta) => {
      const resposta = await get(`/ocorrencias/mapa${consulta}`);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({ codigo: 'BBOX_INVALIDA' });
    });
  });
});
