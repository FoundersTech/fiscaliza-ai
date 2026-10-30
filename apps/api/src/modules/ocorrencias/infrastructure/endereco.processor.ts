import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
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
    if (job) registrarFalha(this.logger, `Endereço de ${job.data.ocorrenciaId}`, job, erro);
  }
}
