import { randomUUID } from 'node:crypto';

import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, CATEGORIAS, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../identidade/application/portas.js';
import { Papel } from '../identidade/domain/papel.js';
import { FILA_MIDIA } from '../midia/application/fotos-enviadas.js';
import { configStorage, criarClienteS3 } from '../midia/infrastructure/storage-r2.adapter.js';
import { FILA_TERRITORIO } from '../ocorrencias/application/enderecos.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };
const SLUGS_DA_CARGA = CATEGORIAS.map((categoria) => categoria.slug);

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

const CAMPO_POSTE = {
  chave: 'numero_poste',
  rotulo: 'Número do poste',
  tipo: 'texto',
  obrigatorio: true,
  max: 20,
};

interface CategoriaAdmin {
  id: number;
  slug: string;
  nome: string;
  icone: string;
  sla_dias: number;
  schema_atributos: unknown[];
  ativa: boolean;
}

describe('/admin/categorias', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let s3: S3Client;
  let bucketUploads: string;
  let filaFotos: Queue;
  let admin: string;
  let cidadao: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODING_PORT)
      .useValue(geocoding)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    await aplicarCargaInicial(prisma);

    const config = configStorage(app.get<Ambiente>(AMBIENTE));
    s3 = criarClienteS3(config);
    bucketUploads = config.bucketUploads;
    filaFotos = app.get<Queue>(getQueueToken(FILA_MIDIA));
    // O processamento das fotos tem testes próprios.
    await filaFotos.pause();
  });

  afterAll(async () => {
    await limparCategoriasCriadas();
    await filaFotos.obliterate({ force: true });
    await app.get<Queue>(getQueueToken(FILA_TERRITORIO)).obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await limparCategoriasCriadas();
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
    admin = await token(Papel.ADMIN_PLATAFORMA);
    cidadao = await token(Papel.CIDADAO);
  });

  /** Os outros arquivos de teste contam com só as 4 categorias da carga inicial. */
  async function limparCategoriasCriadas(): Promise<void> {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.categoria.deleteMany({ where: { slug: { notIn: SLUGS_DA_CARGA } } });
  }

  /** Conta já com a política aceita; o guard confere no banco, então ela precisa existir. */
  async function token(papel: Papel): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId: papel === Papel.ADMIN_MUNICIPIO ? SOROCABA.id : null,
        politicaVersao: '1',
      },
    });
    return app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
      usuarioId: usuario.id,
      papel,
      municipioId: usuario.municipioId,
      orgaoId: null,
    });
  }

  function requisitar(
    method: 'GET' | 'POST' | 'PATCH',
    rota: string,
    autorizacao?: string,
    corpo?: object,
  ) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      headers: autorizacao ? { authorization: `Bearer ${autorizacao}` } : {},
      ...(corpo ? { payload: corpo } : {}),
    });
  }

  function nova(mudancas: Record<string, unknown> = {}) {
    return {
      slug: 'arvores',
      nome: 'Árvores e podas',
      icone: 'park',
      sla_dias: 20,
      schema_atributos: [],
      ...mudancas,
    };
  }

  async function criar(mudancas: Record<string, unknown> = {}): Promise<CategoriaAdmin> {
    const resposta = await requisitar('POST', 'admin/categorias', admin, nova(mudancas));
    expect(resposta.statusCode).toBe(201);
    return resposta.json<CategoriaAdmin>();
  }

  async function slugsAtivos(): Promise<string[]> {
    const resposta = await requisitar('GET', 'config/publica');
    expect(resposta.statusCode).toBe(200);
    return resposta
      .json<{ categorias_ativas: { slug: string }[] }>()
      .categorias_ativas.map((categoria) => categoria.slug);
  }

  /** O caminho do PWA: a foto no bucket de uploads e o POST /ocorrencias. */
  async function registrar(categoriaId: number, atributos: object = {}) {
    const id = randomUUID();
    const chave = `ocorrencias/${id}/1-${randomUUID()}.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketUploads,
        Key: chave,
        Body: 'jpeg',
        ContentType: 'image/jpeg',
      }),
    );
    const resposta = await requisitar('POST', 'ocorrencias', cidadao, {
      id,
      categoria_id: categoriaId,
      descricao: 'Galho grande caído sobre a calçada',
      atributos,
      local: CENTRO,
      fotos: [{ upload_key: chave, ordem: 1 }],
      origem: 'ONLINE',
    });
    return { id, resposta };
  }

  describe('acesso', () => {
    it.each([
      ['GET', 'admin/categorias'],
      ['POST', 'admin/categorias'],
      ['PATCH', 'admin/categorias/1'],
    ] as const)(
      '%s /%s: 401 sem login e 403 ACESSO_NEGADO para outros papéis',
      async (metodo, rota) => {
        expect((await requisitar(metodo, rota, undefined, nova())).statusCode).toBe(401);
        for (const papel of [Papel.CIDADAO, Papel.ADMIN_MUNICIPIO]) {
          const resposta = await requisitar(metodo, rota, await token(papel), nova());
          expect(resposta.statusCode).toBe(403);
          expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
        }
        expect(await prisma.categoria.count()).toBe(SLUGS_DA_CARGA.length);
      },
    );
  });

  describe('cadastro', () => {
    it('cria ativa, aparece no /config/publica e na lista do admin com as inativas', async () => {
      const criada = await criar({ schema_atributos: [CAMPO_POSTE] });
      await criar({ slug: 'sugestao', nome: 'Sugestão', icone: 'lightbulb', ativa: false });

      expect(criada).toMatchObject({
        slug: 'arvores',
        nome: 'Árvores e podas',
        icone: 'park',
        sla_dias: 20,
        schema_atributos: [CAMPO_POSTE],
        ativa: true,
      });
      const ativos = await slugsAtivos();
      expect(ativos).toContain('arvores');
      expect(ativos).not.toContain('sugestao');

      const lista = await requisitar('GET', 'admin/categorias', admin);
      expect(lista.statusCode).toBe(200);
      const slugs = lista.json<CategoriaAdmin[]>().map((categoria) => categoria.slug);
      expect(slugs).toHaveLength(SLUGS_DA_CARGA.length + 2);
      expect(slugs).toContain('sugestao');
    });

    it('slug repetido: 409 SLUG_EM_USO, no POST e no PATCH', async () => {
      const arvores = await criar();

      const repetida = await requisitar('POST', 'admin/categorias', admin, nova({ nome: 'Outra' }));
      const trocada = await requisitar('PATCH', `admin/categorias/${arvores.id}`, admin, {
        slug: 'iluminacao',
      });

      for (const resposta of [repetida, trocada]) {
        expect(resposta.statusCode).toBe(409);
        expect(resposta.json()).toMatchObject({ codigo: 'SLUG_EM_USO' });
      }
      expect(await prisma.categoria.count({ where: { slug: 'arvores' } })).toBe(1);
    });

    it.each([
      ['prazo 0', { sla_dias: 0 }, 'sla_dias'],
      ['prazo negativo', { sla_dias: -5 }, 'sla_dias'],
      ['prazo fracionado', { sla_dias: 1.5 }, 'sla_dias'],
      ['slug com maiúscula', { slug: 'Arvores' }, 'slug'],
      ['schema que não é lista', { schema_atributos: {} }, 'schema_atributos'],
    ])('%s: 422 VALIDACAO', async (_caso, mudancas, campo) => {
      const resposta = await requisitar('POST', 'admin/categorias', admin, nova(mudancas));

      expect(resposta.statusCode).toBe(422);
      const corpo = resposta.json<{ codigo: string; detalhes: { campos: object } }>();
      expect(corpo.codigo).toBe('VALIDACAO');
      expect(corpo.detalhes.campos).toHaveProperty(campo);
    });

    it('schema de atributos malformado: 422 SCHEMA_INVALIDO, no POST e no PATCH', async () => {
      const arvores = await criar();
      const ruim = [{ ...CAMPO_POSTE, tipo: 'numero' }];

      const criacao = await requisitar(
        'POST',
        'admin/categorias',
        admin,
        nova({ slug: 'outra', schema_atributos: ruim }),
      );
      const edicao = await requisitar('PATCH', `admin/categorias/${arvores.id}`, admin, {
        schema_atributos: ruim,
      });

      for (const resposta of [criacao, edicao]) {
        expect(resposta.statusCode).toBe(422);
        expect(resposta.json()).toMatchObject({ codigo: 'SCHEMA_INVALIDO' });
      }
      const gravada = await prisma.categoria.findUniqueOrThrow({ where: { id: arvores.id } });
      expect(gravada.schemaAtributos).toEqual([]);
    });

    it('o PATCH muda só o que foi enviado', async () => {
      const arvores = await criar();

      const resposta = await requisitar('PATCH', `admin/categorias/${arvores.id}`, admin, {
        nome: 'Árvores',
        sla_dias: 25,
        schema_atributos: [CAMPO_POSTE],
      });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({
        ...arvores,
        nome: 'Árvores',
        sla_dias: 25,
        schema_atributos: [CAMPO_POSTE],
      });
    });

    it('categoria inexistente: 404 NAO_ENCONTRADA', async () => {
      for (const id of ['9999', '0', 'abc', '99999999']) {
        const resposta = await requisitar('PATCH', `admin/categorias/${id}`, admin, {
          ativa: false,
        });
        expect(resposta.statusCode).toBe(404);
        expect(resposta.json()).toMatchObject({ codigo: 'NAO_ENCONTRADA' });
      }
    });

    it('o schema novo vale para o registro de ocorrência', async () => {
      const arvores = await criar({ schema_atributos: [CAMPO_POSTE] });

      const sem = await registrar(arvores.id);
      const com = await registrar(arvores.id, { numero_poste: 'P-123' });

      expect(sem.resposta.statusCode).toBe(422);
      expect(sem.resposta.json()).toMatchObject({ codigo: 'ATRIBUTOS_INVALIDOS' });
      expect(com.resposta.statusCode).toBe(201);
    });
  });

  describe('inativar', () => {
    it('some do /config/publica, o registro dá 422 e as ocorrências antigas mantêm a categoria', async () => {
      const arvores = await criar();
      const antiga = await registrar(arvores.id);
      expect(antiga.resposta.statusCode).toBe(201);

      const inativada = await requisitar('PATCH', `admin/categorias/${arvores.id}`, admin, {
        ativa: false,
      });

      expect(inativada.statusCode).toBe(200);
      expect(inativada.json()).toMatchObject({ ativa: false });
      expect(await slugsAtivos()).not.toContain('arvores');

      const recusada = await registrar(arvores.id);
      expect(recusada.resposta.statusCode).toBe(422);
      expect(recusada.resposta.json()).toMatchObject({ codigo: 'CATEGORIA_INATIVA' });
      expect(await prisma.ocorrencia.count({ where: { id: recusada.id } })).toBe(0);

      const gravada = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: antiga.id } });
      expect(gravada.categoriaId).toBe(arvores.id);
      const feed = await requisitar('GET', 'ocorrencias?categoria=arvores');
      expect(feed.statusCode).toBe(200);
      expect(feed.json<{ itens: { id: string; categoria: object }[] }>().itens).toEqual([
        expect.objectContaining({
          id: antiga.id,
          categoria: { slug: 'arvores', nome: 'Árvores e podas', icone: 'park' },
        }),
      ]);
      expect(await prisma.categoria.count({ where: { id: arvores.id } })).toBe(1);
    });

    it('reativada, volta ao /config/publica e aceita ocorrências de novo', async () => {
      const arvores = await criar({ ativa: false });

      await requisitar('PATCH', `admin/categorias/${arvores.id}`, admin, { ativa: true });

      expect(await slugsAtivos()).toContain('arvores');
      expect((await registrar(arvores.id)).resposta.statusCode).toBe(201);
    });
  });
});
