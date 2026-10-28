import { describe, expect, it } from 'vitest';

import { opcoesConexaoRedis } from './conexao-redis.js';

describe('opcoesConexaoRedis', () => {
  it('lê host e porta', () => {
    expect(opcoesConexaoRedis('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
  });

  it('usa a porta 6379 quando ela não vem na URL', () => {
    expect(opcoesConexaoRedis('redis://cache').port).toBe(6379);
  });

  it('lê usuário, senha (decodificada), banco e TLS', () => {
    expect(opcoesConexaoRedis('rediss://app:s%40nha@cache.exemplo.com:6380/2')).toEqual({
      host: 'cache.exemplo.com',
      port: 6380,
      username: 'app',
      password: 's@nha',
      db: 2,
      tls: {},
    });
  });
});
