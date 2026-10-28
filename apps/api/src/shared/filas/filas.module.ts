import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { opcoesConexaoRedis } from '../redis/conexao-redis.js';

/**
 * Conexão do BullMQ. Cada módulo registra as próprias filas com BullModule.registerQueue
 * (design: "Jobs (BullMQ)").
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => ({
        // Os workers do BullMQ exigem maxRetriesPerRequest: null nas conexões bloqueantes.
        connection: { ...opcoesConexaoRedis(ambiente.REDIS_URL), maxRetriesPerRequest: null },
      }),
    }),
  ],
})
export class FilasModule {}
