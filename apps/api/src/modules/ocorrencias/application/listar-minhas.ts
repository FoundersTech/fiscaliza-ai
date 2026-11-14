import { Inject, Injectable } from '@nestjs/common';

import { type Card, MontadorCard } from './card.js';
import {
  CONSULTAS_OCORRENCIAS,
  type ConsultasOcorrencias,
  type ReferenciaOriginal,
} from './consultas.js';
import { CursorFeed } from './listar-feed.js';

export interface MinhaOcorrencia extends Card {
  /** Preenchida só quando a ocorrência foi recusada. */
  justificativaRecusa: string | null;
  /** Preenchida só quando a ocorrência foi marcada como duplicada. */
  original: ReferenciaOriginal | null;
}

export interface PedidoMinhas {
  autorId: string;
  cursor?: string | null;
  limite: number;
}

export interface PaginaMinhas {
  itens: MinhaOcorrencia[];
  proximoCursor: string | null;
}

/** "Minhas ocorrências": todas as do autor, inclusive recusadas e duplicadas. */
@Injectable()
export class ListarMinhas {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    private readonly montadorCard: MontadorCard,
  ) {}

  async executar(pedido: PedidoMinhas, agora = new Date()): Promise<PaginaMinhas> {
    const depoisDe = pedido.cursor ? CursorFeed.decodificar(pedido.cursor) : null;
    const linhas = await this.consultas.doAutor(pedido.autorId, depoisDe, pedido.limite + 1);
    const pagina = linhas.slice(0, pedido.limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map((linha) => ({
        ...this.montadorCard.montar(linha, agora, true),
        justificativaRecusa: linha.justificativaRecusa,
        original: linha.original,
      })),
      proximoCursor:
        linhas.length > pedido.limite && ultima ? CursorFeed.codificar(ultima.posicao) : null,
    };
  }
}
