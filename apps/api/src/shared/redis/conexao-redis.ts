import type { RedisOptions } from 'ioredis';

/** Converte a REDIS_URL nas opções de conexão do ioredis (usadas pelo BullMQ). */
export function opcoesConexaoRedis(url: string): RedisOptions {
  const endereco = new URL(url);
  const banco = endereco.pathname.replace('/', '');

  return {
    host: endereco.hostname,
    port: endereco.port ? Number(endereco.port) : 6379,
    ...(endereco.username ? { username: decodeURIComponent(endereco.username) } : {}),
    ...(endereco.password ? { password: decodeURIComponent(endereco.password) } : {}),
    ...(banco ? { db: Number(banco) } : {}),
    ...(endereco.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
