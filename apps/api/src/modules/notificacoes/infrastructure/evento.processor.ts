import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
import { DestinatariosDoEvento } from '../application/alertas.js';
import { FILA_NOTIFICACOES, type JobNotificacaoEvento } from '../application/fila-notificacoes.js';

/**
 * Worker da fila `notificacoes`. Por enquanto só calcula quem seria avisado e registra no log: o
 * envio do web push entra junto com as inscrições de push. Os destinatários seguem a mesma regra
 * da aba Alertas.
 */
@Processor(FILA_NOTIFICACOES)
export class EventoProcessor extends WorkerHost {
  private readonly logger = new Logger(EventoProcessor.name);

  constructor(private readonly destinatarios: DestinatariosDoEvento) {
    super();
  }

  async process(job: Job<JobNotificacaoEvento>): Promise<void> {
    const destinatarios = await this.destinatarios.executar(job.data.eventoId);
    this.logger.log(
      `Evento ${job.data.eventoId} da ocorrência ${job.data.ocorrenciaId}: ${destinatarios.length} destinatário(s); push ainda não enviado`,
    );
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobNotificacaoEvento> | undefined, erro: Error): void {
    if (job) registrarFalha(this.logger, `Notificação do evento ${job.data.eventoId}`, job, erro);
  }
}
