import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Redis } from 'ioredis';

import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { opcoesConexaoRedis } from './conexao-redis.js';

/** Cliente Redis da aplicação (health, cache e rate limit). As filas usam conexões próprias. */
export const REDIS = Symbol('REDIS');

const ESPERA_CONEXAO_MS = 3000;

const logger = new Logger('Redis');

function aguardarConexao(cliente: Redis, limiteMs: number): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const temporizador = setTimeout(() => {
      cliente.off('ready', aoConectar);
      rejeitar(new Error(`sem conexão em ${limiteMs} ms`));
    }, limiteMs);
    function aoConectar(): void {
      clearTimeout(temporizador);
      resolver();
    }
    cliente.once('ready', aoConectar);
  });
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente): Redis => {
        const cliente = new Redis({
          ...opcoesConexaoRedis(ambiente.REDIS_URL),
          // Sem fila offline: com o Redis fora, os comandos falham na hora em vez de esperar.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        cliente.on('error', (erro: Error) => logger.warn(`Falha na conexão: ${erro.message}`));
        return cliente;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Espera a conexão abrir antes de aceitar requisições; sem Redis, a API sobe assim mesmo. */
  async onApplicationBootstrap(): Promise<void> {
    // 'wait' = cliente com lazyConnect, que só conecta quando for usado.
    if (this.redis.status === 'ready' || this.redis.status === 'wait') return;
    try {
      await aguardarConexao(this.redis, ESPERA_CONEXAO_MS);
    } catch {
      logger.warn('Redis indisponível na subida; os comandos vão falhar até ele voltar.');
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
