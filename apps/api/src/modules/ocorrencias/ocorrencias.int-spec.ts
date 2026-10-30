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
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { FILA_MIDIA } from '../midia/application/fotos-enviadas.js';
import { configStorage, criarClienteS3 } from '../midia/infrastructure/storage-r2.adapter.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';
import { FILA_TERRITORIO } from './application/enderecos.js';
import { Protocolo } from './domain/protocolo.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };
// Um grau de latitude em Sorocaba tem cerca de 110,75 km.
const METROS_POR_GRAU = 110_751;

function aoNorte(metros: number) {
  return { lat: CENTRO.lat + metros / METROS_POR_GRAU, lng: CENTRO.lng };
}

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

interface Criada {
  id: string;
  protocolo: string;
  status: string;
}

describe('POST /ocorrencias', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let s3: S3Client;
  let bucket: string;
  let filaFotos: Queue;
  let maria: string;
  let joao: string;
  let iluminacao: number;
  let pavimentacao: number;

  async function cadastrar(email: string): Promise<string> {
    const resposta = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/cadastro`,
      payload: {
        nome: 'Pessoa de Teste',
        apelido_publico: 'pessoa',
        email,
        senha: 'senha-forte-1',
        politica_versao: '1',
      },
    });
    return resposta.json<{ access_token: string }>().access_token;
  }

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
    await aplicarCargaInicial(prisma);

    const config = configStorage(app.get<Ambiente>(AMBIENTE));
    s3 = criarClienteS3(config);
    bucket = config.bucketUploads;
    filaFotos = app.get<Queue>(getQueueToken(FILA_MIDIA));

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    maria = await cadastrar('maria@exemplo.test');
    joao = await cadastrar('joao@exemplo.test');

    const categorias = await prisma.categoria.findMany({ select: { id: true, slug: true } });
    iluminacao = categorias.find((categoria) => categoria.slug === 'iluminacao')!.id;
    pavimentacao = categorias.find((categoria) => categoria.slug === 'pavimentacao')!.id;
  });

  afterAll(async () => {
    await filaFotos.obliterate({ force: true });
    await app.get<Queue>(getQueueToken(FILA_TERRITORIO)).obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await filaFotos.obliterate({ force: true });
    // O processamento tem testes próprios; aqui as fotos ficam PENDENTE na fila.
    await filaFotos.pause();
    geocoding.enderecoDe.mockReset();
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
  });

  /** Grava a foto no bucket como o PWA faria pelo link de envio. */
  async function fotoEnviada(ocorrenciaId: string, ordem = 1): Promise<string> {
    const chave = `ocorrencias/${ocorrenciaId}/${ordem}-${randomUUID()}.jpg`;
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: chave, Body: 'jpeg', ContentType: 'image/jpeg' }),
    );
    return chave;
  }

  async function corpo(mudancas: Record<string, unknown> = {}) {
    const id = (mudancas['id'] as string | undefined) ?? randomUUID();
    return {
      id,
      categoria_id: iluminacao,
      descricao: 'Poste apagado há uma semana na esquina',
      local: CENTRO,
      precisao_m: 8,
      fotos: [{ upload_key: await fotoEnviada(id), ordem: 1 }],
      origem: 'ONLINE',
      ...mudancas,
    };
  }

  function registrar(payload: object, token = maria) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/ocorrencias`,
      payload,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('exige login de cidadão', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/ocorrencias`,
      payload: await corpo(),
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('cria com status RECEBIDA, 1 evento, município, órgão, endereço e as fotos PENDENTE na fila', async () => {
    const payload = await corpo({ publicar_autor: true, atributos: {} });

    const resposta = await registrar(payload);

    expect(resposta.statusCode).toBe(201);
    const criada = resposta.json<Criada>();
    expect(criada).toEqual({
      id: payload.id,
      protocolo: `FA-${Protocolo.anoDe(new Date())}-SOR-000001`,
      status: 'RECEBIDA',
    });
    const orgao = await prisma.orgao.findUniqueOrThrow({ where: { municipioId: SOROCABA.id } });
    const gravada = await prisma.ocorrencia.findUniqueOrThrow({
      where: { id: payload.id },
      include: { eventos: true, fotos: true },
    });
    expect(gravada).toMatchObject({
      status: 'RECEBIDA',
      municipioId: SOROCABA.id,
      orgaoId: orgao.id,
      bairroId: null,
      endereco: 'Rua A, 1 · Centro',
      precisaoM: 8,
      publicarAutor: true,
      atributos: {},
    });
    expect(gravada.eventos).toHaveLength(1);
    expect(gravada.eventos[0]).toMatchObject({ deStatus: null, paraStatus: 'RECEBIDA' });
    expect(gravada.fotos).toHaveLength(1);
    expect(gravada.fotos[0]).toMatchObject({
      ordem: 1,
      uploadKey: payload.fotos[0]!.upload_key,
      moderacao: 'PENDENTE',
    });
    const [local] = await prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(local::geometry) AS lat, ST_X(local::geometry) AS lng
      FROM ocorrencia WHERE id = ${payload.id}::uuid`;
    expect(local).toEqual({ lat: CENTRO.lat, lng: CENTRO.lng });
    expect(await filaFotos.getJob(`foto-${gravada.fotos[0]!.id}`)).toBeDefined();
  });

  it('2 POSTs com o mesmo id geram uma única ocorrência e um único protocolo', async () => {
    const payload = await corpo();

    const primeira = await registrar(payload);
    const segunda = await registrar(payload);
    const [terceira, quarta] = await Promise.all([registrar(payload), registrar(payload)]);

    expect(primeira.statusCode).toBe(201);
    for (const repetida of [segunda, terceira, quarta]) {
      expect(repetida.statusCode).toBe(200);
      expect(repetida.json()).toEqual(primeira.json());
    }
    expect(await prisma.ocorrencia.count()).toBe(1);
    expect(await prisma.protocoloSequencia.findFirst()).toMatchObject({ ultimo: 1 });
  });

  it('2 POSTs simultâneos com um id novo também geram uma só', async () => {
    const payload = await corpo();

    const respostas = await Promise.all([registrar(payload), registrar(payload)]);

    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([200, 201]);
    expect(await prisma.ocorrencia.count()).toBe(1);
    expect(await prisma.protocoloSequencia.findFirst()).toMatchObject({ ultimo: 1 });
  });

  it('o id de outra pessoa devolve 409 ID_EM_USO', async () => {
    const payload = await corpo();
    await registrar(payload);

    const resposta = await registrar(payload, joao);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ codigo: 'ID_EM_USO' });
  });

  it('20 POSTs em paralelo geram 20 protocolos distintos e consecutivos', async () => {
    const payloads = await Promise.all(
      Array.from({ length: 20 }, () => corpo({ origem: 'OFFLINE' })),
    );

    const respostas = await Promise.all(payloads.map((payload) => registrar(payload)));

    expect(respostas.map((resposta) => resposta.statusCode)).toEqual(Array(20).fill(201));
    const numeros = respostas
      .map((resposta) => Number(resposta.json<Criada>().protocolo.slice(-6)))
      .sort((a, b) => a - b);
    expect(numeros).toEqual(Array.from({ length: 20 }, (_valor, indice) => indice + 1));
  });

  describe('duplicidade', () => {
    let original: Criada;

    beforeEach(async () => {
      original = (await registrar(await corpo())).json<Criada>();
    });

    it('uma aberta da mesma categoria a 50 m devolve 409 com a candidata', async () => {
      const resposta = await registrar(await corpo({ local: aoNorte(50) }));

      expect(resposta.statusCode).toBe(409);
      const erro = resposta.json<{
        codigo: string;
        detalhes: { candidatas: { distancia_m: number }[] };
      }>();
      expect(erro).toMatchObject({
        codigo: 'DUPLICATA_POSSIVEL',
        detalhes: {
          candidatas: [
            {
              id: original.id,
              protocolo: original.protocolo,
              resumo: 'Poste apagado há uma semana na esquina',
              confirmacoes: 0,
            },
          ],
        },
      });
      expect(erro.detalhes.candidatas[0]!.distancia_m).toBeGreaterThanOrEqual(49);
      expect(erro.detalhes.candidatas[0]!.distancia_m).toBeLessThanOrEqual(51);
      expect(await prisma.ocorrencia.count()).toBe(1);
    });

    it('a 70 m, com outra categoria ou com forcar_criacao, devolve 201', async () => {
      const a70 = await registrar(await corpo({ local: aoNorte(70) }));
      const outraCategoria = await registrar(
        await corpo({ local: aoNorte(50), categoria_id: pavimentacao }),
      );
      const forcada = await registrar(await corpo({ local: aoNorte(50), forcar_criacao: true }));

      expect([a70.statusCode, outraCategoria.statusCode, forcada.statusCode]).toEqual([
        201, 201, 201,
      ]);
    });

    it('origem OFFLINE a 50 m devolve 201', async () => {
      const resposta = await registrar(await corpo({ local: aoNorte(50), origem: 'OFFLINE' }));

      expect(resposta.statusCode).toBe(201);
    });

    it('a ocorrência que já não está aberta não conta', async () => {
      await prisma.ocorrencia.update({ where: { id: original.id }, data: { status: 'RESOLVIDA' } });

      expect((await registrar(await corpo({ local: aoNorte(50) }))).statusCode).toBe(201);
    });
  });

  describe('recusas', () => {
    it('foto que não chegou ao bucket ou de outra ocorrência dá 422 FOTO_NAO_ENVIADA', async () => {
      const id = randomUUID();
      const naoEnviada = `ocorrencias/${id}/1-${randomUUID()}.jpg`;
      const deOutra = await fotoEnviada(randomUUID(), 2);

      const resposta = await registrar(
        await corpo({
          id,
          fotos: [
            { upload_key: naoEnviada, ordem: 1 },
            { upload_key: deOutra, ordem: 2 },
          ],
        }),
      );

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'FOTO_NAO_ENVIADA',
        detalhes: { upload_keys: [naoEnviada, deOutra] },
      });
    });

    it('ponto fora de Sorocaba dá 422 FORA_DA_AREA', async () => {
      const resposta = await registrar(await corpo({ local: { lat: -23.5505, lng: -46.6333 } }));

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'FORA_DA_AREA',
        mensagem: 'O Fiscaliza Aí! ainda não atende esta região.',
      });
    });

    it('categoria desativada dá 422 CATEGORIA_INATIVA', async () => {
      await prisma.categoria.update({ where: { id: iluminacao }, data: { ativa: false } });
      try {
        const resposta = await registrar(await corpo());

        expect(resposta.statusCode).toBe(422);
        expect(resposta.json()).toMatchObject({ codigo: 'CATEGORIA_INATIVA' });
      } finally {
        await prisma.categoria.update({ where: { id: iluminacao }, data: { ativa: true } });
      }
    });

    it.each([
      ['descrição curta', { descricao: 'curta' }, 'descricao'],
      ['3 fotos', { fotos: [1, 2, 3].map((ordem) => ({ upload_key: 'x', ordem })) }, 'fotos'],
      ['sem fotos', { fotos: [] }, 'fotos'],
      ['latitude inválida', { local: { lat: 95, lng: CENTRO.lng } }, 'local.lat'],
      ['origem desconhecida', { origem: 'PWA' }, 'origem'],
    ])('%s dá 422 VALIDACAO', async (_caso, mudancas, campo) => {
      const resposta = await registrar(await corpo(mudancas));

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { [campo]: expect.any(Array) as string[] } },
      });
    });
  });

  it('com o geocodificador fora do ar, nasce sem endereço e a fila preenche depois', async () => {
    geocoding.enderecoDe
      .mockRejectedValueOnce(new Error('Nominatim respondeu 503'))
      .mockResolvedValue({ rua: 'Rua B', numero: '2', bairro: null });
    const payload = await corpo();

    const resposta = await registrar(payload);

    expect(resposta.statusCode).toBe(201);
    await vi.waitFor(
      async () => {
        const gravada = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: payload.id } });
        expect(gravada.endereco).toBe('Rua B, 2');
      },
      { timeout: 5000, interval: 100 },
    );
  });
});
