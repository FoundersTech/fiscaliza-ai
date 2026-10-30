import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { prefixoDaOcorrencia } from '../domain/foto.js';
import { STORAGE_PORT, type StoragePort } from './portas.js';

/** Fila e job `midia.processar-foto`. */
export const FILA_MIDIA = 'midia';
export const JOB_PROCESSAR_FOTO = 'processar-foto';

export interface JobProcessarFoto {
  fotoId: string;
}

const SETE_DIAS_S = 7 * 24 * 60 * 60;

@Injectable()
export class ConferirUploads {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  /** Recusa com 422 FOTO_NAO_ENVIADA a chave de outra ocorrência ou que não chegou ao bucket. */
  async executar(ocorrenciaId: string, chaves: readonly string[]): Promise<void> {
    const prefixo = prefixoDaOcorrencia(ocorrenciaId);
    const existem = await Promise.all(
      chaves.map((chave) =>
        chave.startsWith(prefixo) ? this.storage.existeUpload(chave) : Promise.resolve(false),
      ),
    );
    const faltando = chaves.filter((_chave, indice) => !existem[indice]);
    if (faltando.length) {
      throw new ErroAplicacao('FOTO_NAO_ENVIADA', 'Uma das fotos não chegou. Envie de novo.', 422, {
        upload_keys: faltando,
      });
    }
  }
}

/** Enfileira o processamento das fotos de uma ocorrência que acabou de ser gravada. */
@Injectable()
export class FilaFotos {
  private readonly logger = new Logger(FilaFotos.name);

  constructor(@InjectQueue(FILA_MIDIA) private readonly fila: Queue<JobProcessarFoto>) {}

  /** Sem Redis, a foto fica PENDENTE, e a reconciliação a enfileira depois. */
  async processar(fotoIds: readonly string[]): Promise<void> {
    try {
      await this.fila.addBulk(
        fotoIds.map((fotoId) => ({
          name: JOB_PROCESSAR_FOTO,
          data: { fotoId },
          opts: {
            jobId: `foto-${fotoId}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: { age: SETE_DIAS_S },
          },
        })),
      );
    } catch (erro) {
      this.logger.warn(`Fotos ${fotoIds.join(', ')} sem processamento agendado: ${String(erro)}`);
    }
  }
}
