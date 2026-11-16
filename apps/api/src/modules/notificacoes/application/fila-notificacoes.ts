import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

/** Fila e job `notificacoes.evento`. */
export const FILA_NOTIFICACOES = 'notificacoes';
export const JOB_EVENTO = 'evento';

/** Uma mudança de status já gravada; o worker busca o resto (destinatários, protocolo) no banco. */
export interface JobNotificacaoEvento {
  eventoId: number;
  ocorrenciaId: string;
  /** Gravado pelo worker antes de uma nova tentativa: só estas inscrições recebem o push de novo. */
  inscricoesPendentes?: string[];
}

export const TENTATIVAS_NOTIFICACAO = 3;
const ATRASO_INICIAL_MS = 10_000;
const SETE_DIAS_S = 7 * 24 * 60 * 60;

@Injectable()
export class FilaNotificacoes {
  private readonly logger = new Logger(FilaNotificacoes.name);

  constructor(@InjectQueue(FILA_NOTIFICACOES) private readonly fila: Queue<JobNotificacaoEvento>) {}

  /**
   * Avisa quem acompanha a ocorrência. A mudança de status já está gravada: sem Redis, só o push
   * deixa de sair, porque os alertas do app são lidos direto dos eventos.
   */
  async eventoGravado(job: JobNotificacaoEvento): Promise<void> {
    try {
      await this.fila.add(JOB_EVENTO, job, {
        jobId: `evento-${job.eventoId}`,
        attempts: TENTATIVAS_NOTIFICACAO,
        backoff: { type: 'exponential', delay: ATRASO_INICIAL_MS },
        removeOnComplete: true,
        removeOnFail: { age: SETE_DIAS_S },
      });
    } catch (erro) {
      this.logger.warn(
        `Evento ${job.eventoId} da ocorrência ${job.ocorrenciaId} sem notificação: ${String(erro)}`,
      );
    }
  }
}
