import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { FILA_INDICADORES, JOB_RECALCULAR_SCORE } from '../application/recalcular-score.js';

/** O cron do recálculo é lido no horário de São Paulo. */
const FUSO_AGENDA = 'America/Sao_Paulo';

/**
 * Grava o agendamento do recálculo do score no Redis a cada subida, com o cron do
 * parametros.json. Com várias instâncias da API, continua um agendamento só.
 */
@Injectable()
export class AgendaIndicadores implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgendaIndicadores.name);

  constructor(
    @InjectQueue(FILA_INDICADORES) private readonly fila: Queue,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
  ) {}

  /** Não espera o Redis: sem ele, a API sobe, e vale o agendamento já gravado. */
  onApplicationBootstrap(): void {
    this.fila
      .upsertJobScheduler(
        JOB_RECALCULAR_SCORE,
        { pattern: this.parametros.score.recalculo_cron, tz: FUSO_AGENDA },
        { name: JOB_RECALCULAR_SCORE, opts: { removeOnComplete: true, removeOnFail: 50 } },
      )
      .catch((erro: unknown) => {
        this.logger.warn(`Job ${JOB_RECALCULAR_SCORE} sem agendamento: ${String(erro)}`);
      });
  }
}
