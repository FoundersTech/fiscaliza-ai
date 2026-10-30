import { Inject, Injectable } from '@nestjs/common';

import { FilaFotos } from './fotos-enviadas.js';
import { REPOSITORIO_FOTOS, type RepositorioFotos } from './portas.js';

const LOTE = 500;

@Injectable()
export class ReconciliarFotos {
  constructor(
    @Inject(REPOSITORIO_FOTOS) private readonly fotos: RepositorioFotos,
    private readonly filaFotos: FilaFotos,
  ) {}

  /** Reenfileira as fotos que continuam PENDENTE desde antes de `antesDe`. Devolve quantas. */
  async executar(antesDe: Date): Promise<number> {
    const ids = await this.fotos.pendentesCriadasAntes(antesDe, LOTE);
    await this.filaFotos.reenfileirar(ids);
    return ids.length;
  }
}
