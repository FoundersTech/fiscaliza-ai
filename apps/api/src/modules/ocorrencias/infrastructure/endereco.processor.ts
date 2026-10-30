import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import {
  FILA_TERRITORIO,
  type JobPreencherEndereco,
  PreencherEndereco,
} from '../application/enderecos.js';

/** Worker da fila `territorio`: preenche o endereço das ocorrências que nasceram sem ele. */
@Processor(FILA_TERRITORIO)
export class EnderecoProcessor extends WorkerHost {
  private readonly logger = new Logger(EnderecoProcessor.name);

  constructor(private readonly preencherEndereco: PreencherEndereco) {
    super();
  }

  process(job: Job<JobPreencherEndereco>): Promise<void> {
    return this.preencherEndereco.executar(job.data.ocorrenciaId);
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobPreencherEndereco> | undefined, erro: Error): void {
    if (!job) return;
    const tentativas = job.opts.attempts ?? 1;
    const desistiu = job.attemptsMade >= tentativas;
    this.logger[desistiu ? 'error' : 'warn'](
      `Endereço de ${job.data.ocorrenciaId} falhou na tentativa ${job.attemptsMade} de ${tentativas}` +
        `${desistiu ? ', sem novas tentativas' : ''}: ${erro.message}`,
    );
  }
}
