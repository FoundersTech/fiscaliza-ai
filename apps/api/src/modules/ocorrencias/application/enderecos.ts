import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { EnderecoReverso } from '../../territorio/application/territorio.js';
import { REPOSITORIO_OCORRENCIAS, type RepositorioOcorrencias } from './portas.js';

/** Fila e job `territorio.preencher-endereco`. */
export const FILA_TERRITORIO = 'territorio';
export const JOB_PREENCHER_ENDERECO = 'preencher-endereco';

export interface JobPreencherEndereco {
  ocorrenciaId: string;
}

/** 10 tentativas, com a espera dobrando a partir de 170 s: a última sai cerca de 24 h depois. */
export const TENTATIVAS_ENDERECO = 10;
const ATRASO_INICIAL_MS = 170_000;
const SETE_DIAS_S = 7 * 24 * 60 * 60;

@Injectable()
export class FilaEnderecos {
  private readonly logger = new Logger(FilaEnderecos.name);

  constructor(@InjectQueue(FILA_TERRITORIO) private readonly fila: Queue<JobPreencherEndereco>) {}

  /** Sem Redis, o endereço fica nulo, e a reconciliação o enfileira depois. */
  async preencher(ocorrenciaId: string): Promise<void> {
    try {
      await this.fila.add(
        JOB_PREENCHER_ENDERECO,
        { ocorrenciaId },
        {
          jobId: `endereco-${ocorrenciaId}`,
          attempts: TENTATIVAS_ENDERECO,
          backoff: { type: 'exponential', delay: ATRASO_INICIAL_MS },
          removeOnComplete: true,
          removeOnFail: { age: SETE_DIAS_S },
        },
      );
    } catch (erro) {
      this.logger.warn(`Endereço de ${ocorrenciaId} sem busca agendada: ${String(erro)}`);
    }
  }
}

/** Busca o endereço de uma ocorrência que nasceu sem ele. */
@Injectable()
export class PreencherEndereco {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
    private readonly enderecoReverso: EnderecoReverso,
  ) {}

  /** Lança erro enquanto o geocodificador não responder, para a fila tentar de novo. */
  async executar(ocorrenciaId: string): Promise<void> {
    const local = await this.ocorrencias.localSemEndereco(ocorrenciaId);
    if (!local) return;
    const endereco = await this.enderecoReverso.executar(local);
    if (!endereco) throw new Error('endereço ainda indisponível');
    await this.ocorrencias.gravarEndereco(ocorrenciaId, endereco);
  }
}
