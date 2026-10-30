import { Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { CriarIntencaoUpload } from './application/intencao-upload.js';
import { STORAGE_PORT } from './application/portas.js';
import { configStorage, StorageR2Adapter } from './infrastructure/storage-r2.adapter.js';
import { UploadsController } from './presentation/uploads.controller.js';

/** Fotos das ocorrências: envio direto ao storage. */
@Module({
  controllers: [UploadsController],
  providers: [
    CriarIntencaoUpload,
    {
      provide: STORAGE_PORT,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new StorageR2Adapter(configStorage(ambiente)),
    },
  ],
})
export class MidiaModule {}
