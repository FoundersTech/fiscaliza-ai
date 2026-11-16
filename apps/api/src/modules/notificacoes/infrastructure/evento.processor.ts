import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { registrarFalha } from '../../../shared/filas/registrar-falha.js';
import { FILA_NOTIFICACOES, type JobNotificacaoEvento } from '../application/fila-notificacoes.js';
import { EnviarPushEvento } from '../application/push.js';

/**
 * Worker da fila `notificacoes`: manda o push da mudança de status para quem a vê na aba Alertas.
 * Se algum navegador falhar por um motivo passageiro, o job falha e a nova tentativa vai só para
 * esses navegadores, sem repetir o push para quem já recebeu.
 */
@Processor(FILA_NOTIFICACOES)
export class EventoProcessor extends WorkerHost {
  private readonly logger = new Logger(EventoProcessor.name);

  constructor(private readonly enviarPush: EnviarPushEvento) {
    super();
  }

  async process(job: Job<JobNotificacaoEvento>): Promise<void> {
    const { eventoId, ocorrenciaId, inscricoesPendentes } = job.data;
    const resultado = await this.enviarPush.executar({
      eventoId,
      ...(inscricoesPendentes ? { somenteInscricoes: inscricoesPendentes } : {}),
    });

    if (resultado.enviados || resultado.expirados || resultado.falharam.length) {
      this.logger.log(
        `Push do evento ${eventoId} da ocorrência ${ocorrenciaId}: ${resultado.enviados} enviado(s), ${resultado.expirados} inscrição(ões) expirada(s) apagada(s), ${resultado.falharam.length} falha(s)`,
      );
    }
    if (resultado.falharam.length) {
      await job.updateData({ ...job.data, inscricoesPendentes: resultado.falharam });
      throw new Error(`${resultado.falharam.length} inscrição(ões) sem o push; nova tentativa`);
    }
  }

  @OnWorkerEvent('failed')
  aoFalhar(job: Job<JobNotificacaoEvento> | undefined, erro: Error): void {
    if (job) registrarFalha(this.logger, `Notificação do evento ${job.data.eventoId}`, job, erro);
  }
}
