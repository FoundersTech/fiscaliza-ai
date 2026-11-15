import { Writable } from 'node:stream';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { Logger, PARAMS_PROVIDER_TOKEN } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configurarApp, PREFIXO_API } from '../app.setup.js';
import { aplicarCargaInicial } from '../cli/seed/carga-inicial.js';
import { criarConfigLogger } from '../shared/logger/logger.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { REDIS } from '../shared/redis/redis.module.js';

/** Guarda tudo o que o pino escreve, para o teste procurar dados pessoais. */
class Captura extends Writable {
  readonly linhas: string[] = [];

  override _write(pedaco: Buffer, _codificacao: string, terminar: () => void): void {
    this.linhas.push(pedaco.toString());
    terminar();
  }
}

const EMAIL = 'maria.silva@exemplo.test';
const SENHA = 'senha-forte-da-maria-1';
const IP = '203.0.113.50';

describe('Logs sem dados pessoais', () => {
  const captura = new Captura();
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const segredos: string[] = [];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      // O mesmo logger da API, no nível mais detalhado e escrevendo na captura.
      .overrideProvider(PARAMS_PROVIDER_TOKEN)
      .useValue(criarConfigLogger({ NODE_ENV: 'test', LOG_LEVEL: 'trace' }, captura))
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await aplicarCargaInicial(prisma);
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);

    // Cadastro, login errado e certo, renovação, esqueci a senha e exclusão da conta.
    const pedir = (
      method: 'POST' | 'DELETE',
      rota: string,
      extra: {
        payload?: object;
        headers?: Record<string, string>;
        cookies?: Record<string, string>;
      } = {},
    ) =>
      app.inject({
        method,
        url: `/${PREFIXO_API}/${rota}`,
        remoteAddress: IP,
        ...extra,
      });

    const cadastro = await pedir('POST', 'auth/cadastro', {
      payload: {
        nome: 'Maria Silva',
        apelido_publico: 'maria',
        email: EMAIL,
        senha: SENHA,
        politica_versao: '1',
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const repetido = await pedir('POST', 'auth/cadastro', {
      payload: {
        nome: 'Maria Silva',
        apelido_publico: 'maria',
        email: EMAIL,
        senha: SENHA,
        politica_versao: '1',
      },
    });
    expect(repetido.statusCode).toBe(409);

    expect(
      (await pedir('POST', 'auth/login', { payload: { email: EMAIL, senha: 'errada-123' } }))
        .statusCode,
    ).toBe(401);
    const login = await pedir('POST', 'auth/login', { payload: { email: EMAIL, senha: SENHA } });
    expect(login.statusCode).toBe(200);
    const acesso = login.json<{ access_token: string }>().access_token;
    const refresh = login.cookies.find((cookie) => cookie.name === 'fa_refresh')!.value;
    segredos.push(acesso, refresh);

    const renovacao = await pedir('POST', 'auth/refresh', {
      headers: { 'x-fa-csrf': '1' },
      cookies: { fa_refresh: refresh },
    });
    expect(renovacao.statusCode).toBe(200);
    const novoAcesso = renovacao.json<{ access_token: string }>().access_token;
    segredos.push(
      novoAcesso,
      renovacao.cookies.find((cookie) => cookie.name === 'fa_refresh')!.value,
    );

    expect(
      (await pedir('POST', 'auth/esqueci-senha', { payload: { email: EMAIL } })).statusCode,
    ).toBe(202);

    const exclusao = await pedir('DELETE', 'me', {
      headers: { authorization: `Bearer ${novoAcesso}` },
      payload: { senha: SENHA },
    });
    expect(exclusao.statusCode).toBe(204);
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await app.close();
  });

  const log = () => captura.linhas.join('');

  it('os pedidos foram registrados no log', () => {
    for (const rota of ['auth/cadastro', 'auth/login', 'auth/refresh', 'auth/esqueci-senha']) {
      expect(log()).toContain(`/${PREFIXO_API}/${rota}`);
    }
    expect(log()).toContain('"method":"DELETE"');
  });

  it('não há "@" no log: nenhum e-mail', () => {
    expect(log()).not.toContain('@');
  });

  it('não há senha, token de acesso, refresh token nem IP no log', () => {
    expect(log()).not.toContain(SENHA);
    for (const segredo of segredos) expect(log()).not.toContain(segredo);
    expect(log()).not.toContain(IP);
  });
});
