import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { FazerBackup, JOB_BACKUP } from '../application/fazer-backup.js';
import { JOB_LIMPEZA, Limpeza } from '../application/limpeza.js';
import { FILA_MANUTENCAO, JOB_RECONCILIAR, Reconciliar } from '../application/reconciliar.js';

/** Worker da fila `manutencao`: um worker só para todos os jobs agendados da fila. */
@Processor(FILA_MANUTENCAO)
export class ManutencaoProcessor extends WorkerHost {
  private readonly logger = new Logger(ManutencaoProcessor.name);

  constructor(
    private readonly reconciliar: Reconciliar,
    private readonly limpeza: Limpeza,
    private readonly backup: FazerBackup,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOB_RECONCILIAR:
        return this.reconciliar.executar();
      case JOB_LIMPEZA:
        await this.limpeza.executar();
        return;
      case JOB_BACKUP:
        await this.backup.executar();
        return;
      default:
        throw new Error(`Job desconhecido na fila ${FILA_MANUTENCAO}: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job | undefined, erro: Error): void {
    if (!job) return;
    // O backup que falha não tenta de novo sozinho: o alerta é este log, e o de amanhã roda.
    const alerta = job.name === JOB_BACKUP ? 'ALERTA: backup do banco não foi feito. ' : '';
    this.logger.error(`${alerta}Job ${job.name} da manutenção falhou: ${erro.message}`);
  }
}
