import { Injectable, Logger } from '@nestjs/common';

import { ReconciliarFotos } from '../../midia/application/reconciliar-fotos.js';
import { ReconciliarEnderecos } from '../../ocorrencias/application/enderecos.js';

/** Fila `manutencao` e o job `reconciliar`, agendado a cada 10 min. */
export const FILA_MANUTENCAO = 'manutencao';
export const JOB_RECONCILIAR = 'reconciliar';
export const INTERVALO_RECONCILIACAO_MS = 10 * 60_000;

/** Depois disso, uma foto ou um endereço que não saiu da fila ficou para trás. */
const ESPERA_MS = 10 * 60_000;

@Injectable()
export class Reconciliar {
  private readonly logger = new Logger(Reconciliar.name);

  constructor(
    private readonly fotos: ReconciliarFotos,
    private readonly enderecos: ReconciliarEnderecos,
  ) {}

  /** Põe de volta na fila o que ficou para trás, como o job que não entrou com o Redis fora. */
  async executar(agora = new Date()): Promise<void> {
    const antesDe = new Date(agora.getTime() - ESPERA_MS);
    const fotos = await this.fotos.executar(antesDe);
    const enderecos = await this.enderecos.executar(antesDe);
    if (fotos || enderecos) {
      this.logger.log(
        `Reconciliação: ${fotos} fotos PENDENTE e ${enderecos} ocorrências sem endereço conferidas`,
      );
    }
  }
}
