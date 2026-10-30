import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { FILA_MANUTENCAO, JOB_RECONCILIAR, Reconciliar } from '../application/reconciliar.js';

/** Worker da fila `manutencao`: um worker só para todos os jobs agendados da fila. */
@Processor(FILA_MANUTENCAO)
export class ManutencaoProcessor extends WorkerHost {
  private readonly logger = new Logger(ManutencaoProcessor.name);

  constructor(private readonly reconciliar: Reconciliar) {
    super();
  }

  process(job: Job): Promise<void> {
    if (job.name === JOB_RECONCILIAR) return this.reconciliar.executar();
    return Promise.reject(new Error(`Job desconhecido na fila ${FILA_MANUTENCAO}: ${job.name}`));
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job | undefined, erro: Error): void {
    if (job) this.logger.error(`Job ${job.name} da manutenção falhou: ${erro.message}`);
  }
}
