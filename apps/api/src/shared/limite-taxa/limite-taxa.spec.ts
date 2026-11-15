import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import { GuardLimiteTaxa, type RegraLimiteTaxa } from './limite-taxa.js';

const REGRA: RegraLimiteTaxa = {
  nome: 'teste',
  maximo: 1,
  janelaSegundos: 60,
  chave: ({ ip }) => ip,
};

function contexto(): ExecutionContext {
  const resposta = { header: vi.fn() };
  return {
    getHandler: () => () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ ip: '203.0.113.7' }),
      getResponse: () => resposta,
    }),
  } as unknown as ExecutionContext;
}

/** Redis falso: a contagem da janela cresce a cada chamada. */
function redisFalso(): { redis: Redis; chamadas: () => number } {
  let total = 0;
  const redis = {
    multi: () => {
      const cadeia = {
        set: () => cadeia,
        incr: () => cadeia,
        ttl: () => cadeia,
        exec: () => {
          total += 1;
          return Promise.resolve([
            [null, 'OK'],
            [null, total],
            [null, 60],
          ]);
        },
      };
      return cadeia;
    },
  } as unknown as Redis;
  return { redis, chamadas: () => total };
}

function guard(redis: Redis, desligado: boolean): GuardLimiteTaxa {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'get').mockReturnValue(REGRA);
  return new GuardLimiteTaxa(reflector, redis, { LIMITE_TAXA_DESLIGADO: desligado });
}

describe('GuardLimiteTaxa', () => {
  it('passou do máximo na janela: responde 429', async () => {
    const { redis } = redisFalso();
    const limite = guard(redis, false);

    await expect(limite.canActivate(contexto())).resolves.toBe(true);
    await expect(limite.canActivate(contexto())).rejects.toMatchObject({
      codigo: 'MUITAS_REQUISICOES',
    });
  });

  it('com o limite desligado, libera tudo sem contar no Redis', async () => {
    const { redis, chamadas } = redisFalso();
    const limite = guard(redis, true);

    for (let i = 0; i < 5; i += 1) {
      await expect(limite.canActivate(contexto())).resolves.toBe(true);
    }
    expect(chamadas()).toBe(0);
  });
});
