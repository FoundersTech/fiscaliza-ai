import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import {
  FILA_INDICADORES,
  JOB_RECALCULAR_SCORE,
  RecalcularScore,
} from '../application/recalcular-score.js';

/** Worker da fila `indicadores`. */
@Processor(FILA_INDICADORES)
export class IndicadoresProcessor extends WorkerHost {
  private readonly logger = new Logger(IndicadoresProcessor.name);

  constructor(private readonly recalcularScore: RecalcularScore) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_RECALCULAR_SCORE) {
      throw new Error(`Job desconhecido na fila ${FILA_INDICADORES}: ${job.name}`);
    }
    await this.recalcularScore.executar();
  }

  /** O desempenho gravado antes continua valendo; o próximo horário do cron tenta de novo. */
  @OnWorkerEvent('failed')
  aoFalhar(job: Job | undefined, erro: Error): void {
    if (!job) return;
    this.logger.error(`Job ${job.name} dos indicadores falhou: ${erro.message}`, erro.stack);
  }
}
