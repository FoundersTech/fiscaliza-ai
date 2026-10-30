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
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { FILA_MIDIA } from '../midia/application/fotos-enviadas.js';
import { configStorage, criarClienteS3 } from '../midia/infrastructure/storage-r2.adapter.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

describe('POST /ocorrencias/:id/confirmacoes', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let s3: S3Client;
  let bucket: string;
  let filaFotos: Queue;
  let maria: string;
  let joao: string;
  let ana: string;
  let categoriaId: number;

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
    ana = await cadastrar('ana@exemplo.test');
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;
  });

  afterAll(async () => {
    await filaFotos.obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await filaFotos.obliterate({ force: true });
    // As fotos de mentira ficam na fila, sem processamento.
    await filaFotos.pause();
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
  });

  function registrar(payload: Record<string, unknown>, token = maria) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/ocorrencias`,
      payload,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  async function corpo(mudancas: Record<string, unknown> = {}) {
    const id = randomUUID();
    const chave = `ocorrencias/${id}/1-${randomUUID()}.jpg`;
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: chave, Body: 'jpeg', ContentType: 'image/jpeg' }),
    );
    return {
      id,
      categoria_id: categoriaId,
      descricao: 'Poste apagado há uma semana na esquina',
      local: CENTRO,
      fotos: [{ upload_key: chave, ordem: 1 }],
      origem: 'ONLINE',
      ...mudancas,
    };
  }

  /** Ocorrência da Maria. */
  async function ocorrenciaDaMaria(): Promise<string> {
    const payload = await corpo();
    expect((await registrar(payload)).statusCode).toBe(201);
    return payload.id;
  }

  function confirmar(id: string, token?: string) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/ocorrencias/${id}/confirmacoes`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function confirmacoesNoBanco(id: string): Promise<number> {
    return prisma.confirmacao.count({ where: { ocorrenciaId: id } });
  }

  it('exige login de cidadão', async () => {
    expect((await confirmar(randomUUID())).statusCode).toBe(401);
  });

  it('devolve 201 com o contador atualizado a cada pessoa', async () => {
    const id = await ocorrenciaDaMaria();

    const primeira = await confirmar(id, joao);
    const segunda = await confirmar(id, ana);

    expect(primeira.statusCode).toBe(201);
    expect(primeira.json()).toEqual({ confirmacoes: 1 });
    expect(segunda.statusCode).toBe(201);
    expect(segunda.json()).toEqual({ confirmacoes: 2 });
    expect(await confirmacoesNoBanco(id)).toBe(2);
  });

  it('a segunda tentativa da mesma pessoa é 409 JA_CONFIRMADA e não muda o contador', async () => {
    const id = await ocorrenciaDaMaria();
    await confirmar(id, joao);

    const repetida = await confirmar(id, joao);

    expect(repetida.statusCode).toBe(409);
    expect(repetida.json()).toMatchObject({ codigo: 'JA_CONFIRMADA' });
    expect(await confirmacoesNoBanco(id)).toBe(1);
  });

  it('dois toques ao mesmo tempo gravam uma confirmação só', async () => {
    const id = await ocorrenciaDaMaria();

    const respostas = await Promise.all([confirmar(id, joao), confirmar(id, joao)]);

    expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([201, 409]);
    expect(await confirmacoesNoBanco(id)).toBe(1);
  });

  it('o autor recebe 403 AUTOR_NAO_CONFIRMA', async () => {
    const id = await ocorrenciaDaMaria();

    const resposta = await confirmar(id, maria);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ codigo: 'AUTOR_NAO_CONFIRMA' });
    expect(await confirmacoesNoBanco(id)).toBe(0);
  });

  it('uma ocorrência RESOLVIDA é 422 OCORRENCIA_FECHADA', async () => {
    const id = await ocorrenciaDaMaria();
    await prisma.ocorrencia.update({
      where: { id },
      data: { status: 'RESOLVIDA', resolvidaEm: new Date() },
    });

    const resposta = await confirmar(id, joao);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      codigo: 'OCORRENCIA_FECHADA',
      detalhes: { status: 'RESOLVIDA' },
    });
    expect(await confirmacoesNoBanco(id)).toBe(0);
  });

  it('id inexistente, inválido ou de uma RECUSADA de outra pessoa é 404 NAO_ENCONTRADA', async () => {
    const recusada = await ocorrenciaDaMaria();
    await prisma.ocorrencia.update({ where: { id: recusada }, data: { status: 'RECUSADA' } });

    for (const id of [randomUUID(), 'nao-e-uuid', recusada]) {
      const resposta = await confirmar(id, joao);
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toMatchObject({ codigo: 'NAO_ENCONTRADA' });
    }
  });

  it('"Também vi" no lugar de uma nova aparece na candidata da próxima duplicata', async () => {
    const id = await ocorrenciaDaMaria();
    const duplicata = await registrar(await corpo(), joao);
    expect(duplicata.statusCode).toBe(409);

    await confirmar(id, joao);

    const outra = await registrar(await corpo(), ana);
    expect(outra.json()).toMatchObject({
      codigo: 'DUPLICATA_POSSIVEL',
      detalhes: { candidatas: [{ id, confirmacoes: 1 }] },
    });
  });
});
