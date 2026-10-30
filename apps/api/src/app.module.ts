import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { IdentidadeModule } from './modules/identidade/identidade.module.js';
import { MidiaModule } from './modules/midia/midia.module.js';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module.js';
import { OcorrenciasModule } from './modules/ocorrencias/ocorrencias.module.js';
import { TerritorioModule } from './modules/territorio/territorio.module.js';
import { AMBIENTE, type Ambiente } from './shared/config/ambiente.js';
import { ConfiguracaoModule } from './shared/config/configuracao.module.js';
import { FilasModule } from './shared/filas/filas.module.js';
import { criarConfigLogger } from './shared/logger/logger.js';
import { PrismaModule } from './shared/prisma/prisma.module.js';
import { RedisModule } from './shared/redis/redis.module.js';
import { SaudeModule } from './shared/saude/saude.module.js';

@Module({
  imports: [
    ConfiguracaoModule,
    LoggerModule.forRootAsync({
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => criarConfigLogger(ambiente),
    }),
    PrismaModule,
    RedisModule,
    FilasModule,
    SaudeModule,
    NotificacoesModule,
    IdentidadeModule,
    TerritorioModule,
    MidiaModule,
    OcorrenciasModule,
  ],
})
export class AppModule {}
