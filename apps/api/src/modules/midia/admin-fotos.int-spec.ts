import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, NotFound, type S3Client } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fotoPequena } from '../../../test/fotos.js';
import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../identidade/application/portas.js';
import { Papel } from '../identidade/domain/papel.js';
import { FILA_TERRITORIO } from '../ocorrencias/application/enderecos.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';
import { FILA_MIDIA } from './application/fotos-enviadas.js';
import { chavesPublicas } from './domain/foto.js';
import {
  type ConfigStorage,
  configStorage,
  criarClienteS3,
} from './infrastructure/storage-r2.adapter.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

interface FotoRevisao {
  id: string;
  ocorrencia_id: string;
  protocolo: string;
  ordem: number;
  moderacao: string;
  url: string | null;
  miniatura_url: string | null;
  motivo_rejeicao: string | null;
  criada_em: string;
}

interface PaginaRevisao {
  itens: FotoRevisao[];
  proximo_cursor: string | null;
}

interface Card {
  id: string;
  miniatura_url: string | null;
  foto_em_analise: boolean;
}

describe('/admin/fotos', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let s3: S3Client;
  let config: ConfigStorage;
  let urlPublica: string;
  let filaFotos: Queue;
  let admin: string;
  let cidadao: string;
  let categoriaId: number;

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

    const ambiente = app.get<Ambiente>(AMBIENTE);
    config = configStorage(ambiente);
    urlPublica = ambiente.R2_URL_PUBLICA;
    s3 = criarClienteS3(config);
    filaFotos = app.get<Queue>(getQueueToken(FILA_MIDIA));
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;
  });

  afterAll(async () => {
    await filaFotos.obliterate({ force: true });
    await app.get<Queue>(getQueueToken(FILA_TERRITORIO)).obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await filaFotos.resume();
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
    admin = await token(Papel.ADMIN_PLATAFORMA);
    cidadao = await token(Papel.CIDADAO);
  });

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

  function requisitar(method: 'GET' | 'POST', rota: string, autorizacao?: string, corpo?: object) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      headers: autorizacao ? { authorization: `Bearer ${autorizacao}` } : {},
      ...(corpo ? { payload: corpo } : {}),
    });
  }

  /** O caminho do PWA: intenção, PUT no link e registro. */
  async function registrarComFoto(): Promise<{ ocorrenciaId: string; fotoId: string }> {
    const conteudo = await fotoPequena();
    const ocorrenciaId = randomUUID();
    const intencao = await requisitar('POST', 'uploads/intencao', cidadao, {
      ocorrencia_id: ocorrenciaId,
      ordem: 1,
      content_type: 'image/jpeg',
      bytes: conteudo.length,
    });
    expect(intencao.statusCode).toBe(201);
    const { upload_url, upload_key } = intencao.json<{ upload_url: string; upload_key: string }>();
    const envio = await fetch(upload_url, {
      method: 'PUT',
      body: new Uint8Array(conteudo),
      headers: { 'content-type': 'image/jpeg' },
    });
    expect(envio.status).toBe(200);
    const registro = await requisitar('POST', 'ocorrencias', cidadao, {
      id: ocorrenciaId,
      categoria_id: categoriaId,
      descricao: 'Poste apagado há uma semana na esquina',
      local: CENTRO,
      fotos: [{ upload_key, ordem: 1 }],
      // Sem a checagem de duplicidade: as ocorrências do teste ficam todas no mesmo ponto.
      origem: 'OFFLINE',
    });
    expect(registro.statusCode).toBe(201);
    const foto = await prisma.ocorrenciaFoto.findFirstOrThrow({ where: { ocorrenciaId } });
    return { ocorrenciaId, fotoId: foto.id };
  }

  async function registrarAprovada(): Promise<{ ocorrenciaId: string; fotoId: string }> {
    const registrada = await registrarComFoto();
    await vi.waitFor(
      async () => {
        const foto = await prisma.ocorrenciaFoto.findUniqueOrThrow({
          where: { id: registrada.fotoId },
        });
        expect(foto.moderacao).toBe('APROVADA');
      },
      { timeout: 10_000, interval: 100 },
    );
    return registrada;
  }

  async function publicada(chave: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: config.bucketFotos, Key: chave }));
      return true;
    } catch (erro) {
      if (erro instanceof NotFound) return false;
      throw erro;
    }
  }

  async function cardDe(ocorrenciaId: string): Promise<Card> {
    const resposta = await requisitar('GET', 'ocorrencias');
    expect(resposta.statusCode).toBe(200);
    const card = resposta.json<{ itens: Card[] }>().itens.find((item) => item.id === ocorrenciaId);
    expect(card).toBeDefined();
    return card!;
  }

  function rejeitar(fotoId: string, motivo = 'Mostra o rosto de uma pessoa', quem = admin) {
    return requisitar('POST', `admin/fotos/${fotoId}/rejeicao`, quem, { motivo });
  }

  it('a foto rejeitada some do feed na hora, e a foto e a miniatura são apagadas do bucket público', async () => {
    const { ocorrenciaId, fotoId } = await registrarAprovada();
    const chaves = chavesPublicas(ocorrenciaId, fotoId);
    expect(await cardDe(ocorrenciaId)).toMatchObject({
      miniatura_url: `${urlPublica}/${chaves.miniatura}`,
      foto_em_analise: false,
    });
    expect(await publicada(chaves.foto)).toBe(true);
    expect(await publicada(chaves.miniatura)).toBe(true);

    const resposta = await rejeitar(fotoId);

    expect(resposta.statusCode).toBe(204);
    expect(await cardDe(ocorrenciaId)).toMatchObject({
      miniatura_url: null,
      foto_em_analise: true,
    });
    expect(await publicada(chaves.foto)).toBe(false);
    expect(await publicada(chaves.miniatura)).toBe(false);
    const anonimo = await fetch(`${config.endpoint}/${config.bucketFotos}/${chaves.foto}`);
    expect(anonimo.status).toBe(404);
    expect(await prisma.ocorrenciaFoto.findUniqueOrThrow({ where: { id: fotoId } })).toMatchObject({
      moderacao: 'REJEITADA',
      motivoRejeicao: 'Mostra o rosto de uma pessoa',
    });
  });

  it('repetir a rejeição devolve 204 e mantém o primeiro motivo', async () => {
    const { fotoId } = await registrarAprovada();

    expect((await rejeitar(fotoId, 'Primeiro motivo')).statusCode).toBe(204);
    expect((await rejeitar(fotoId, 'Segundo motivo')).statusCode).toBe(204);

    const foto = await prisma.ocorrenciaFoto.findUniqueOrThrow({ where: { id: fotoId } });
    expect(foto.motivoRejeicao).toBe('Primeiro motivo');
  });

  it('lista as aprovadas com o endereço público, e as rejeitadas com o motivo e sem endereço', async () => {
    const primeira = await registrarAprovada();
    const segunda = await registrarAprovada();
    await rejeitar(primeira.fotoId);

    const aprovadas = await requisitar('GET', 'admin/fotos', admin);
    const rejeitadas = await requisitar('GET', 'admin/fotos?moderacao=REJEITADA', admin);

    expect(aprovadas.statusCode).toBe(200);
    const chaves = chavesPublicas(segunda.ocorrenciaId, segunda.fotoId);
    expect(aprovadas.json<PaginaRevisao>()).toEqual({
      itens: [
        {
          id: segunda.fotoId,
          ocorrencia_id: segunda.ocorrenciaId,
          protocolo: expect.stringMatching(/^FA-\d{4}-SOR-\d{6}$/) as string,
          ordem: 1,
          moderacao: 'APROVADA',
          url: `${urlPublica}/${chaves.foto}`,
          miniatura_url: `${urlPublica}/${chaves.miniatura}`,
          motivo_rejeicao: null,
          criada_em: expect.any(String) as string,
        },
      ],
      proximo_cursor: null,
    });
    expect(rejeitadas.json<PaginaRevisao>().itens).toEqual([
      expect.objectContaining({
        id: primeira.fotoId,
        moderacao: 'REJEITADA',
        url: null,
        miniatura_url: null,
        motivo_rejeicao: 'Mostra o rosto de uma pessoa',
      }),
    ]);
  });

  it('pagina das mais novas às mais antigas, sem repetir nem pular', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await registrarAprovada()).fotoId);

    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const resposta = await requisitar(
        'GET',
        `admin/fotos?limite=2${cursor ? `&cursor=${cursor}` : ''}`,
        admin,
      );
      expect(resposta.statusCode).toBe(200);
      const pagina: PaginaRevisao = resposta.json<PaginaRevisao>();
      vistos.push(...pagina.itens.map((item) => item.id));
      cursor = pagina.proximo_cursor;
    } while (cursor);

    expect(vistos).toEqual([...ids].reverse());
  });

  it('foto ainda em processamento: 409 FOTO_EM_ANALISE', async () => {
    await filaFotos.pause();
    const { fotoId } = await registrarComFoto();

    const resposta = await rejeitar(fotoId);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ codigo: 'FOTO_EM_ANALISE' });
    expect(await prisma.ocorrenciaFoto.findUniqueOrThrow({ where: { id: fotoId } })).toMatchObject({
      moderacao: 'PENDENTE',
    });
  });

  it('foto inexistente ou id inválido: 404 NAO_ENCONTRADA', async () => {
    for (const id of [randomUUID(), 'nao-e-uuid']) {
      const resposta = await rejeitar(id);
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toMatchObject({ codigo: 'NAO_ENCONTRADA' });
    }
  });

  it('sem motivo: 422 VALIDACAO, e a foto continua no ar', async () => {
    const { ocorrenciaId, fotoId } = await registrarAprovada();

    const resposta = await rejeitar(fotoId, '  ');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ codigo: 'VALIDACAO' });
    expect(await publicada(chavesPublicas(ocorrenciaId, fotoId).foto)).toBe(true);
  });

  it('só o ADMIN_PLATAFORMA lista e rejeita: 401 sem login, 403 ACESSO_NEGADO para os outros', async () => {
    const { ocorrenciaId, fotoId } = await registrarAprovada();

    expect((await requisitar('GET', 'admin/fotos')).statusCode).toBe(401);
    expect((await rejeitar(fotoId, 'Imprópria', '')).statusCode).toBe(401);
    for (const papel of [Papel.CIDADAO, Papel.ADMIN_MUNICIPIO]) {
      const outro = await token(papel);
      for (const resposta of [
        await requisitar('GET', 'admin/fotos', outro),
        await rejeitar(fotoId, 'Imprópria', outro),
      ]) {
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
      }
    }
    expect(await publicada(chavesPublicas(ocorrenciaId, fotoId).foto)).toBe(true);
  });
});
