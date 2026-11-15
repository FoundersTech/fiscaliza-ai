import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
import { FILA_PRIVACIDADE, GerarExportacao, type JobExportar } from '../application/exportacoes.js';

/** Worker da fila `privacidade`: gera o arquivo das exportações pedidas. */
@Processor(FILA_PRIVACIDADE)
export class ExportacaoProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportacaoProcessor.name);

  constructor(private readonly gerarExportacao: GerarExportacao) {
    super();
  }

  process(job: Job<JobExportar>): Promise<void> {
    return this.gerarExportacao.executar(job.data.exportacaoId);
  }

  @OnWorkerEvent('failed')
  async aoFalhar(job: Job<JobExportar> | undefined, erro: Error): Promise<void> {
    if (!job) return;
    registrarFalha(this.logger, `Exportação ${job.data.exportacaoId}`, job, erro);
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      try {
        await this.gerarExportacao.falhou(job.data.exportacaoId);
      } catch (falha) {
        this.logger.error(
          `Exportação ${job.data.exportacaoId} não foi marcada como falha: ${String(falha)}`,
        );
      }
    }
  }
}
