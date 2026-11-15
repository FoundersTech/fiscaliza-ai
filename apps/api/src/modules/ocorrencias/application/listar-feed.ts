import { Inject, Injectable } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { type StatusPublico, statusInternosDe } from '../domain/exibicao-publica.js';
import { type Card, MontadorCard } from './card.js';
import {
  CONSULTAS_OCORRENCIAS,
  type ConsultasOcorrencias,
  type FiltroPublico,
  type PosicaoFeed,
} from './consultas.js';

export interface FiltrosPublicos {
  municipioId?: number | null;
  status?: StatusPublico[] | null;
  categorias?: string[] | null;
}

export interface PedidoFeed extends FiltrosPublicos {
  cursor?: string | null;
  limite: number;
}

export interface PaginaFeed {
  itens: Card[];
  /** Null na última página. */
  proximoCursor: string | null;
}

export function filtroPublico(filtros: FiltrosPublicos): FiltroPublico {
  return {
    municipioId: filtros.municipioId ?? null,
    status: statusInternosDe(filtros.status ?? null),
    categorias: filtros.categorias?.length ? filtros.categorias : null,
  };
}

const DATA_EXATA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor opaco da paginação: a posição do último item da página, em base64url. */
export const CursorFeed = {
  codificar(posicao: PosicaoFeed): string {
    return Buffer.from(JSON.stringify([posicao.criadaEm, posicao.id])).toString('base64url');
  },

  decodificar(cursor: string): PosicaoFeed {
    let valor: unknown;
    try {
      valor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      throw cursorInvalido();
    }
    if (
      !Array.isArray(valor) ||
      valor.length !== 2 ||
      typeof valor[0] !== 'string' ||
      typeof valor[1] !== 'string' ||
      !DATA_EXATA.test(valor[0]) ||
      Number.isNaN(Date.parse(valor[0])) ||
      !UUID.test(valor[1])
    ) {
      throw cursorInvalido();
    }
    return { criadaEm: valor[0], id: valor[1] };
  },
};

function cursorInvalido(): ErroAplicacao {
  return new ErroAplicacao('VALIDACAO', 'Dados inválidos.', 422, {
    campos: { cursor: ['cursor inválido; recomece pela primeira página'] },
  });
}

/** Feed público: ocorrências visíveis, das mais recentes para as mais antigas, por cursor. */
@Injectable()
export class ListarFeed {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    private readonly montadorCard: MontadorCard,
  ) {}

  async executar(pedido: PedidoFeed, agora = new Date()): Promise<PaginaFeed> {
    const depoisDe = pedido.cursor ? CursorFeed.decodificar(pedido.cursor) : null;
    // Um item a mais diz se existe próxima página sem precisar contar.
    const linhas = await this.consultas.feed(filtroPublico(pedido), depoisDe, pedido.limite + 1);
    const pagina = linhas.slice(0, pedido.limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map((linha) => this.montadorCard.montar(linha, agora)),
      proximoCursor:
        linhas.length > pedido.limite && ultima ? CursorFeed.codificar(ultima.posicao) : null,
    };
  }
}
