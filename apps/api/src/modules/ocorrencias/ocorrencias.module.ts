import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MidiaModule } from '../midia/midia.module.js';
import { TerritorioModule } from '../territorio/territorio.module.js';
import { ConfirmarOcorrencia } from './application/confirmar-ocorrencia.js';
import {
  FILA_TERRITORIO,
  FilaEnderecos,
  PreencherEndereco,
  ReconciliarEnderecos,
} from './application/enderecos.js';
import { REPOSITORIO_OCORRENCIAS } from './application/portas.js';
import { RegistrarOcorrencia } from './application/registrar-ocorrencia.js';
import { EnderecoProcessor } from './infrastructure/endereco.processor.js';
import { RepositorioOcorrenciasPrisma } from './infrastructure/repositorio-ocorrencias.prisma.js';
import { OcorrenciasController } from './presentation/ocorrencias.controller.js';

/** Registro e confirmação de ocorrências, e o endereço das que nasceram sem ele. */
@Module({
  imports: [TerritorioModule, MidiaModule, BullModule.registerQueue({ name: FILA_TERRITORIO })],
  controllers: [OcorrenciasController],
  providers: [
    RegistrarOcorrencia,
    ConfirmarOcorrencia,
    FilaEnderecos,
    PreencherEndereco,
    ReconciliarEnderecos,
    EnderecoProcessor,
    { provide: REPOSITORIO_OCORRENCIAS, useClass: RepositorioOcorrenciasPrisma },
  ],
  exports: [ReconciliarEnderecos],
})
export class OcorrenciasModule {}
