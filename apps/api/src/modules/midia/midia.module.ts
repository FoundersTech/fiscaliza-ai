import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PARAMETROS, type Parametros } from '../../shared/config/parametros.js';
import { ConferirUploads, FILA_MIDIA, FilaFotos } from './application/fotos-enviadas.js';
import { CriarIntencaoUpload } from './application/intencao-upload.js';
import {
  MODERACAO_PORT,
  PROCESSADOR_IMAGEM,
  REPOSITORIO_FOTOS,
  STORAGE_PORT,
} from './application/portas.js';
import { ProcessarFoto } from './application/processar-foto.js';
import { ReconciliarFotos } from './application/reconciliar-fotos.js';
import { FotoProcessor } from './infrastructure/foto.processor.js';
import { moderacaoPara } from './infrastructure/moderacao.js';
import { ProcessadorSharp } from './infrastructure/processador-sharp.adapter.js';
import { RepositorioFotosPrisma } from './infrastructure/repositorio-fotos.prisma.js';
import { configStorage, StorageR2Adapter } from './infrastructure/storage-r2.adapter.js';
import { UploadsController } from './presentation/uploads.controller.js';

/** Fotos das ocorrências: envio direto ao storage, processamento e publicação. */
@Module({
  imports: [BullModule.registerQueue({ name: FILA_MIDIA })],
  controllers: [UploadsController],
  providers: [
    CriarIntencaoUpload,
    ConferirUploads,
    FilaFotos,
    ProcessarFoto,
    ReconciliarFotos,
    FotoProcessor,
    {
      provide: STORAGE_PORT,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new StorageR2Adapter(configStorage(ambiente)),
    },
    { provide: PROCESSADOR_IMAGEM, useClass: ProcessadorSharp },
    {
      provide: MODERACAO_PORT,
      inject: [PARAMETROS],
      useFactory: (parametros: Parametros) => moderacaoPara(parametros.moderacao_estrategia),
    },
    { provide: REPOSITORIO_FOTOS, useClass: RepositorioFotosPrisma },
  ],
  exports: [ConferirUploads, FilaFotos, ReconciliarFotos],
})
export class MidiaModule {}
