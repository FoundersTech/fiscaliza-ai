import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MidiaModule } from '../midia/midia.module.js';
import { OcorrenciasModule } from '../ocorrencias/ocorrencias.module.js';
import { FILA_MANUTENCAO, Reconciliar } from './application/reconciliar.js';
import { AgendaManutencao } from './infrastructure/agenda-manutencao.js';
import { ManutencaoProcessor } from './infrastructure/manutencao.processor.js';

/** Jobs agendados que corrigem o que ficou para trás nas outras filas. */
@Module({
  imports: [MidiaModule, OcorrenciasModule, BullModule.registerQueue({ name: FILA_MANUTENCAO })],
  providers: [Reconciliar, ManutencaoProcessor, AgendaManutencao],
})
export class ManutencaoModule {}
