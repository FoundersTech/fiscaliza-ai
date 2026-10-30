import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import {
  FILA_MANUTENCAO,
  INTERVALO_RECONCILIACAO_MS,
  JOB_RECONCILIAR,
} from '../application/reconciliar.js';

/**
 * Grava o agendamento no Redis a cada subida. Com várias instâncias da API, continua um
 * agendamento só, e cada execução roda num worker só.
 */
@Injectable()
export class AgendaManutencao implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendaManutencao.name);

  constructor(@InjectQueue(FILA_MANUTENCAO) private readonly fila: Queue) {}

  /** Não espera o Redis: sem ele, a API sobe, e vale o agendamento já gravado. */
  onApplicationBootstrap(): void {
    this.fila
      .upsertJobScheduler(
        JOB_RECONCILIAR,
        { every: INTERVALO_RECONCILIACAO_MS },
        { name: JOB_RECONCILIAR, opts: { removeOnComplete: true, removeOnFail: 50 } },
      )
      .catch((erro: unknown) => {
        this.logger.warn(`Reconciliação sem agendamento: ${String(erro)}`);
      });
  }
}
