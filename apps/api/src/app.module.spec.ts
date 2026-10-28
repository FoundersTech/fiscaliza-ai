import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';
import { configurarApp, PREFIXO_API } from './app.setup.js';

describe('AppModule', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sobe com Fastify e responde 404 para rota inexistente', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${PREFIXO_API}/rota-inexistente` });

    expect(resposta.statusCode).toBe(404);
  });
});
