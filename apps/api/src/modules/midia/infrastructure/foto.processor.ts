import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
import { FILA_MIDIA, type JobProcessarFoto } from '../application/fotos-enviadas.js';
import { ProcessarFoto } from '../application/processar-foto.js';

/** Worker da fila `midia`: recodifica, modera e publica cada foto enviada. */
@Processor(FILA_MIDIA)
export class FotoProcessor extends WorkerHost {
  private readonly logger = new Logger(FotoProcessor.name);

  constructor(private readonly processarFoto: ProcessarFoto) {
    super();
  }

  process(job: Job<JobProcessarFoto>): Promise<void> {
    return this.processarFoto.executar(job.data.fotoId);
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobProcessarFoto> | undefined, erro: Error): void {
    if (job) registrarFalha(this.logger, `Foto ${job.data.fotoId}`, job, erro);
  }
}
