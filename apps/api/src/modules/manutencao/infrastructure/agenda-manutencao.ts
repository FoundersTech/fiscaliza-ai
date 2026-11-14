import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue, RepeatOptions } from 'bullmq';

import { AGENDA_BACKUP, JOB_BACKUP } from '../application/fazer-backup.js';
import { AGENDA_LIMPEZA, JOB_LIMPEZA } from '../application/limpeza.js';
import {
  FILA_MANUTENCAO,
  INTERVALO_RECONCILIACAO_MS,
  JOB_RECONCILIAR,
} from '../application/reconciliar.js';

/** Os horários dos jobs diários são de São Paulo. */
export const FUSO_AGENDA = 'America/Sao_Paulo';

const AGENDAS: Record<string, Omit<RepeatOptions, 'key'>> = {
  [JOB_RECONCILIAR]: { every: INTERVALO_RECONCILIACAO_MS },
  [JOB_LIMPEZA]: { pattern: AGENDA_LIMPEZA, tz: FUSO_AGENDA },
  [JOB_BACKUP]: { pattern: AGENDA_BACKUP, tz: FUSO_AGENDA },
};

/**
 * Grava os agendamentos no Redis a cada subida. Com várias instâncias da API, continua um
 * agendamento só por job, e cada execução roda num worker só.
 */
@Injectable()
export class AgendaManutencao implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendaManutencao.name);

  constructor(@InjectQueue(FILA_MANUTENCAO) private readonly fila: Queue) {}

  /** Não espera o Redis: sem ele, a API sobe, e valem os agendamentos já gravados. */
  onApplicationBootstrap(): void {
    for (const [nome, agenda] of Object.entries(AGENDAS)) {
      this.fila
        .upsertJobScheduler(nome, agenda, {
          name: nome,
          opts: { removeOnComplete: true, removeOnFail: 50 },
        })
        .catch((erro: unknown) => {
          this.logger.warn(`Job ${nome} da manutenção sem agendamento: ${String(erro)}`);
        });
    }
  }
}
