import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';

interface Intencao {
  upload_url: string;
  upload_key: string;
  expira_em: string;
}

describe('POST /uploads/intencao', () => {
  let app: NestFastifyApplication;
  let token: string;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await app.get(PrismaService).$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    const cadastro = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/cadastro`,
      payload: {
        nome: 'Maria da Silva',
        apelido_publico: 'maria.s',
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
        politica_versao: '1',
      },
    });
    token = cadastro.json<{ access_token: string }>().access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  function pedir(corpo: Record<string, unknown>, autorizado = true) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/uploads/intencao`,
      payload: corpo,
      headers: autorizado ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function corpo(mudancas: Record<string, unknown> = {}) {
    return {
      ocorrencia_id: randomUUID(),
      ordem: 1,
      content_type: 'image/jpeg',
      bytes: 200_000,
      ...mudancas,
    };
  }

  it('exige login', async () => {
    expect((await pedir(corpo(), false)).statusCode).toBe(401);
  });

  it('devolve a URL de envio, a chave da ocorrência e o vencimento em 5 min', async () => {
    const ocorrenciaId = randomUUID();
    const antes = Date.now();

    const resposta = await pedir(corpo({ ocorrencia_id: ocorrenciaId, ordem: 2 }));

    expect(resposta.statusCode).toBe(201);
    const intencao = resposta.json<Intencao>();
    expect(intencao.upload_key).toMatch(new RegExp(`^ocorrencias/${ocorrenciaId}/2-.+\\.jpg$`));
    const vencimento = new Date(intencao.expira_em).getTime();
    expect(vencimento).toBeGreaterThanOrEqual(antes + 300_000 - 1000);
    expect(vencimento).toBeLessThanOrEqual(Date.now() + 300_000);

    const envio = await fetch(intencao.upload_url, {
      method: 'PUT',
      body: new Uint8Array(200_000),
      headers: { 'Content-Type': 'image/jpeg' },
    });
    expect(envio.status).toBe(200);
  });

  it.each([
    ['301 KB', { bytes: 301 * 1024 }],
    ['0 bytes', { bytes: 0 }],
    ['PNG', { content_type: 'image/png' }],
  ])('foto de %s dá 422 FOTO_INVALIDA', async (_caso, mudancas) => {
    const resposta = await pedir(corpo(mudancas));

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ codigo: 'FOTO_INVALIDA' });
  });

  it.each([
    ['ordem 3', { ordem: 3 }, 'ordem'],
    ['id que não é UUID', { ocorrencia_id: 'abc' }, 'ocorrencia_id'],
    ['bytes em texto', { bytes: '200000' }, 'bytes'],
  ])('%s dá 422 VALIDACAO', async (_caso, mudancas, campo) => {
    const resposta = await pedir(corpo(mudancas));

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: { campos: { [campo]: expect.any(Array) as string[] } },
    });
  });
});
