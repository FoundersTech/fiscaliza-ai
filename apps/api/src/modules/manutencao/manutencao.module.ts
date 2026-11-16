import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { configStorage } from '../midia/infrastructure/storage-r2.adapter.js';
import { MidiaModule } from '../midia/midia.module.js';
import { OcorrenciasModule } from '../ocorrencias/ocorrencias.module.js';
import { ExpirarExportacoes } from './application/expirar-exportacoes.js';
import { FazerBackup } from './application/fazer-backup.js';
import { Limpeza } from './application/limpeza.js';
import {
  ARMAZEM_BACKUP,
  ARQUIVOS_EXPORTACAO,
  GERADOR_DUMP,
  REPOSITORIO_EXPORTACOES,
} from './application/portas.js';
import { FILA_MANUTENCAO, Reconciliar } from './application/reconciliar.js';
import { AgendaManutencao } from './infrastructure/agenda-manutencao.js';
import { BucketS3 } from './infrastructure/bucket-s3.adapter.js';
import { ManutencaoProcessor } from './infrastructure/manutencao.processor.js';
import { PgDump } from './infrastructure/pg-dump.adapter.js';
import { RepositorioExportacoesPrisma } from '../privacidade/infrastructure/repositorio-exportacoes.prisma.js';
import { PrivacidadeModule } from '../privacidade/privacidade.module.js';

/** Jobs agendados: reconciliação das filas, limpeza diária e backup diário do banco. */
@Module({
  imports: [
    MidiaModule,
    OcorrenciasModule,
    PrivacidadeModule,
    BullModule.registerQueue({ name: FILA_MANUTENCAO }),
  ],
  providers: [
    Reconciliar,
    Limpeza,
    ExpirarExportacoes,
    FazerBackup,
    ManutencaoProcessor,
    AgendaManutencao,
    { provide: REPOSITORIO_EXPORTACOES, useExisting: RepositorioExportacoesPrisma },
    {
      provide: ARQUIVOS_EXPORTACAO,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => {
        const config = configStorage(ambiente);
        return new BucketS3(config, config.bucketUploads);
      },
    },
    {
      provide: ARMAZEM_BACKUP,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => {
        const config = configStorage(ambiente);
        return new BucketS3(config, config.bucketBackup);
      },
    },
    {
      provide: GERADOR_DUMP,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new PgDump(ambiente.DATABASE_URL),
    },
  ],
})
export class ManutencaoModule {}
