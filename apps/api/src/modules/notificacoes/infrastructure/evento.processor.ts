import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
import { FILA_NOTIFICACOES, type JobNotificacaoEvento } from '../application/fila-notificacoes.js';

/**
 * Worker da fila `notificacoes`. Por enquanto só registra o evento recebido: o cálculo dos
 * destinatários e o envio do web push entram junto com as inscrições de push.
 */
@Processor(FILA_NOTIFICACOES)
export class EventoProcessor extends WorkerHost {
  private readonly logger = new Logger(EventoProcessor.name);

  process(job: Job<JobNotificacaoEvento>): Promise<void> {
    this.logger.log(
      `Evento ${job.data.eventoId} da ocorrência ${job.data.ocorrenciaId} recebido; push ainda não enviado`,
    );
    return Promise.resolve();
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobNotificacaoEvento> | undefined, erro: Error): void {
    if (job) registrarFalha(this.logger, `Notificação do evento ${job.data.eventoId}`, job, erro);
  }
}
