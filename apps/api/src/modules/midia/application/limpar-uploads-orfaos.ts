import { Inject, Injectable } from '@nestjs/common';

import { PREFIXO_UPLOADS_FOTOS } from '../domain/foto.js';
import {
  REPOSITORIO_FOTOS,
  type RepositorioFotos,
  STORAGE_PORT,
  type StoragePort,
} from './portas.js';

/**
 * Apaga os originais de foto que nenhuma ocorrência usa: o PUT chegou ao bucket, mas a
 * ocorrência nunca foi registrada (ou trocou de foto). O original de uma foto ainda não
 * processada continua lá, porque a foto aponta para ele.
 */
@Injectable()
export class LimparUploadsOrfaos {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(REPOSITORIO_FOTOS) private readonly fotos: RepositorioFotos,
  ) {}

  /** Só olha os gravados antes de `antesDe`. Devolve quantos apagou. */
  async executar(antesDe: Date): Promise<number> {
    const orfaos: string[] = [];
    for await (const chaves of this.storage.uploadsGravadosAntes(PREFIXO_UPLOADS_FOTOS, antesDe)) {
      const emUso = await this.fotos.uploadsEmUso(chaves);
      orfaos.push(...chaves.filter((chave) => !emUso.has(chave)));
    }
    // Apaga depois de listar tudo, para não mexer no bucket no meio da paginação.
    for (const chave of orfaos) await this.storage.apagarUpload(chave);
    return orfaos.length;
  }
}
