import type { Redis } from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Ambiente } from '../config/ambiente.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SaudeService } from './saude.service.js';

const AMBIENTE_TESTE = { APP_VERSAO: 'abc1234' } as Ambiente;

function criarServico(banco: () => Promise<unknown>, redis: () => Promise<unknown>): SaudeService {
  const prisma = { $queryRaw: banco } as unknown as PrismaService;
  const clienteRedis = { ping: redis } as unknown as Redis;
  return new SaudeService(prisma, clienteRedis, AMBIENTE_TESTE);
}

const ok = () => Promise.resolve('PONG');
const falha = () => Promise.reject(new Error('fora do ar'));

describe('SaudeService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('informa ok quando banco e Redis respondem', async () => {
    await expect(criarServico(ok, ok).verificar()).resolves.toEqual({
      status: 'ok',
      versao: 'abc1234',
      db: 'ok',
      redis: 'ok',
    });
  });

  it('informa erro no Redis quando ele está fora do ar', async () => {
    await expect(criarServico(ok, falha).verificar()).resolves.toMatchObject({
      status: 'erro',
      db: 'ok',
      redis: 'erro',
    });
  });

  it('considera erro um banco que não responde em 2 s', async () => {
    vi.useFakeTimers();
    const semResposta = () => new Promise(() => undefined);

    const verificacao = criarServico(semResposta, ok).verificar();
    await vi.advanceTimersByTimeAsync(2000);

    await expect(verificacao).resolves.toMatchObject({ status: 'erro', db: 'erro', redis: 'ok' });
  });
});
