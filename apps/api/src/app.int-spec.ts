import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { CAMINHO_DOCS, configurarApp, PREFIXO_API } from './app.setup.js';
import { REDIS } from './shared/redis/redis.module.js';

const FILA_TESTE = 'teste-conexao';

async function criarApp(
  ajustar?: (builder: ReturnType<typeof Test.createTestingModule>) => void,
): Promise<NestFastifyApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, BullModule.registerQueue({ name: FILA_TESTE })],
  });
  ajustar?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configurarApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('API com Postgres e Redis reais', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await criarApp();
  });

  afterAll(async () => {
    await app.get<Queue>(getQueueToken(FILA_TESTE)).obliterate({ force: true });
    await app.close();
  });

  it('GET /health responde 200 com banco e Redis ok', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${PREFIXO_API}/health` });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('rota inexistente responde 404 no formato da API', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${PREFIXO_API}/nao-existe` });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ codigo: 'NAO_ENCONTRADO' });
  });

  it('publica o OpenAPI em /docs-json com a rota de health', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${CAMINHO_DOCS}-json` });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<{ paths: object }>().paths).toHaveProperty(`/${PREFIXO_API}/health`);
  });

  it('o BullMQ conecta no Redis e enfileira jobs', async () => {
    const fila = app.get<Queue>(getQueueToken(FILA_TESTE));

    await fila.add('ping', { em: Date.now() });

    await expect(fila.getJobCounts('waiting')).resolves.toMatchObject({ waiting: 1 });
  });
});

describe('API com o Redis fora do ar', () => {
  let app: NestFastifyApplication;
  let redisInalcancavel: Redis;

  beforeAll(async () => {
    // Porta sem servidor: simula o Redis parado.
    redisInalcancavel = new Redis({
      port: 6390,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    app = await criarApp((builder) => {
      builder.overrideProvider(REDIS).useValue(redisInalcancavel);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 503 apontando o Redis', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${PREFIXO_API}/health` });

    expect(resposta.statusCode).toBe(503);
    expect(resposta.json()).toMatchObject({ status: 'erro', db: 'ok', redis: 'erro' });
  });
});
