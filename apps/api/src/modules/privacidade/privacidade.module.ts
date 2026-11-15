import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { configStorage } from '../midia/infrastructure/storage-r2.adapter.js';
import { ExcluirConta } from './application/excluir-conta.js';
import {
  ConsultarExportacoes,
  FILA_PRIVACIDADE,
  FilaExportacoes,
  GerarExportacao,
  SolicitarExportacao,
} from './application/exportacoes.js';
import {
  ARQUIVOS_EXPORTACAO,
  COLETOR_DADOS,
  REPOSITORIO_CONTAS,
  REPOSITORIO_EXPORTACOES,
} from './application/portas.js';
import { ArquivosExportacaoR2 } from './infrastructure/arquivos-exportacao.r2.js';
import { ColetorDadosPrisma } from './infrastructure/coletor-dados.prisma.js';
import { ExportacaoProcessor } from './infrastructure/exportacao.processor.js';
import { RepositorioContasPrisma } from './infrastructure/repositorio-contas.prisma.js';
import { RepositorioExportacoesPrisma } from './infrastructure/repositorio-exportacoes.prisma.js';
import { PrivacidadeController } from './presentation/privacidade.controller.js';

/** Direitos do titular: exportação dos dados pessoais e exclusão (anonimização) da conta. */
@Module({
  imports: [BullModule.registerQueue({ name: FILA_PRIVACIDADE })],
  controllers: [PrivacidadeController],
  providers: [
    SolicitarExportacao,
    ConsultarExportacoes,
    GerarExportacao,
    FilaExportacoes,
    ExcluirConta,
    ExportacaoProcessor,
    {
      provide: ARQUIVOS_EXPORTACAO,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => new ArquivosExportacaoR2(configStorage(ambiente)),
    },
    { provide: COLETOR_DADOS, useClass: ColetorDadosPrisma },
    { provide: REPOSITORIO_CONTAS, useClass: RepositorioContasPrisma },
    { provide: REPOSITORIO_EXPORTACOES, useClass: RepositorioExportacoesPrisma },
  ],
})
export class PrivacidadeModule {}
