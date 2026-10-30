import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MidiaModule } from '../midia/midia.module.js';
import { TerritorioModule } from '../territorio/territorio.module.js';
import { FILA_TERRITORIO, FilaEnderecos, PreencherEndereco } from './application/enderecos.js';
import { REPOSITORIO_OCORRENCIAS } from './application/portas.js';
import { RegistrarOcorrencia } from './application/registrar-ocorrencia.js';
import { EnderecoProcessor } from './infrastructure/endereco.processor.js';
import { RepositorioOcorrenciasPrisma } from './infrastructure/repositorio-ocorrencias.prisma.js';
import { OcorrenciasController } from './presentation/ocorrencias.controller.js';

/** Registro de ocorrências e o preenchimento do endereço das que nasceram sem ele. */
@Module({
  imports: [TerritorioModule, MidiaModule, BullModule.registerQueue({ name: FILA_TERRITORIO })],
  controllers: [OcorrenciasController],
  providers: [
    RegistrarOcorrencia,
    FilaEnderecos,
    PreencherEndereco,
    EnderecoProcessor,
    { provide: REPOSITORIO_OCORRENCIAS, useClass: RepositorioOcorrenciasPrisma },
  ],
})
export class OcorrenciasModule {}
