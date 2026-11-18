import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configurarApp, PREFIXO_API } from '../app.setup.js';
import { aplicarCargaInicial } from '../cli/seed/carga-inicial.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../modules/identidade/application/portas.js';
import { Papel } from '../modules/identidade/domain/papel.js';
import { LEITURA_PUBLICA } from '../shared/limite-taxa/limite-taxa.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { REDIS } from '../shared/redis/redis.module.js';

describe('Limites de requisições', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    await aplicarCargaInicial(prisma);
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
  });

  async function cidadao(): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel: Papel.CIDADAO,
        politicaVersao: '1',
      },
    });
    return app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
      usuarioId: usuario.id,
      papel: Papel.CIDADAO,
      municipioId: null,
      orgaoId: null,
    });
  }

  function pedir(
    method: 'GET' | 'POST',
    rota: string,
    opcoes: { token?: string; ip?: string; corpo?: object } = {},
  ) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      remoteAddress: opcoes.ip ?? '127.0.0.1',
      headers: opcoes.token ? { authorization: `Bearer ${opcoes.token}` } : {},
      ...(opcoes.corpo ? { payload: opcoes.corpo } : {}),
    });
  }

  describe(`GETs públicos: ${LEITURA_PUBLICA.maximo} por minuto por IP, somando todas as rotas`, () => {
    const ROTAS = [
      'ocorrencias',
      'ocorrencias/mapa?bbox=-47.5,-23.55,-47.4,-23.45',
      `ocorrencias/${randomUUID()}`,
      'config/publica',
      'indicadores/score',
      'indicadores/painel',
    ];

    it(`a ${LEITURA_PUBLICA.maximo + 1}ª GET pública no mesmo minuto devolve 429 com Retry-After`, async () => {
      const respostas = [];
      for (let i = 0; i < LEITURA_PUBLICA.maximo; i++) {
        respostas.push(await pedir('GET', ROTAS[i % ROTAS.length]!, { ip: '203.0.113.10' }));
      }
      expect(respostas.filter((resposta) => resposta.statusCode === 429)).toHaveLength(0);

      const excedente = await pedir('GET', 'config/publica', { ip: '203.0.113.10' });

      expect(excedente.statusCode).toBe(429);
      expect(excedente.json()).toMatchObject({ codigo: 'MUITAS_REQUISICOES' });
      expect(Number(excedente.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(excedente.headers['retry-after'])).toBeLessThanOrEqual(60);
    }, 60_000);

    it('50 pessoas da mesma rede abrem o app no mesmo minuto', async () => {
      // Abrir o app lê a configuração, o feed e o score, e numa rede compartilhada tudo sai do
      // mesmo IP.
      for (let pessoa = 0; pessoa < 50; pessoa++) {
        for (const rota of ['config/publica', 'ocorrencias', 'indicadores/score']) {
          expect((await pedir('GET', rota, { ip: '203.0.113.13' })).statusCode).not.toBe(429);
        }
      }
    }, 60_000);

    it('outro IP continua sendo atendido', async () => {
      for (let i = 0; i <= LEITURA_PUBLICA.maximo; i++) {
        await pedir('GET', 'ocorrencias', { ip: '203.0.113.11' });
      }

      expect((await pedir('GET', 'ocorrencias', { ip: '203.0.113.12' })).statusCode).toBe(200);
    }, 60_000);
  });

  it('/geo/reverso: a 31ª consulta do mesmo usuário no minuto devolve 429, e outro usuário segue', async () => {
    const maria = await cidadao();
    const joao = await cidadao();

    // Sem lat e lng a consulta é inválida (422), mas conta no limite do mesmo jeito.
    for (let i = 0; i < 30; i++) {
      expect((await pedir('GET', 'geo/reverso', { token: maria })).statusCode).toBe(422);
    }
    const excedente = await pedir('GET', 'geo/reverso', { token: maria });

    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({ codigo: 'MUITAS_REQUISICOES' });
    expect((await pedir('GET', 'geo/reverso', { token: joao })).statusCode).toBe(422);
  });

  it('criação de ocorrência: a 61ª do mesmo usuário na hora devolve 429, e outro usuário segue', async () => {
    const maria = await cidadao();
    const joao = await cidadao();

    for (let i = 0; i < 60; i++) {
      expect((await pedir('POST', 'ocorrencias', { token: maria, corpo: {} })).statusCode).toBe(
        422,
      );
    }
    const excedente = await pedir('POST', 'ocorrencias', { token: maria, corpo: {} });

    expect(excedente.statusCode).toBe(429);
    expect(Number(excedente.headers['retry-after'])).toBeGreaterThan(60);
    expect((await pedir('POST', 'ocorrencias', { token: joao, corpo: {} })).statusCode).toBe(422);
  });

  it('o limite por usuário não conta pedidos sem login', async () => {
    for (let i = 0; i < 31; i++) {
      expect((await pedir('GET', 'geo/reverso')).statusCode).toBe(401);
    }
  });
});
