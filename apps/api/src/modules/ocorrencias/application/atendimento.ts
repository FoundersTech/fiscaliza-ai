import { Inject, Injectable } from '@nestjs/common';

import { UrlFotos } from '../../midia/application/url-fotos.js';
import type { EventoHistorico } from '../domain/historico.js';
import { type StatusOcorrencia, TRANSICOES_AGENTE } from '../domain/ocorrencia.js';
import { type Card, MontadorCard } from './card.js';
import { ocorrenciaNaoEncontrada } from './confirmar-ocorrencia.js';
import { CONSULTAS_OCORRENCIAS, type ConsultasOcorrencias } from './consultas.js';
import { CursorFeed } from './listar-feed.js';
import { type Detalhe, montarDetalhe } from './obter-detalhe.js';
import { type Agente, conferirOrgao, outroOrgao } from './transicionar-status.js';

/** Uma ocorrência na fila do órgão: o card, o status interno e o selo "Reaberta". */
export interface ItemFila extends Card {
  status: StatusOcorrencia;
  reaberta: boolean;
}

export interface PedidoFila {
  agente: Agente;
  status?: StatusOcorrencia[] | null;
  categorias?: string[] | null;
  cursor?: string | null;
  limite: number;
}

export interface PaginaFila {
  itens: ItemFila[];
  proximoCursor: string | null;
}

/** O detalhe que o agente vê: com o status interno, todos os eventos e as ações possíveis. */
export interface DetalheAtendimento extends Detalhe {
  status: StatusOcorrencia;
  reaberta: boolean;
  eventos: EventoHistorico[];
  transicoesPermitidas: readonly StatusOcorrencia[];
}

/**
 * Fila do agente: só as ocorrências do próprio órgão, da mais antiga para a mais recente, com
 * qualquer status. Fotos só as aprovadas, como no feed.
 */
@Injectable()
export class ListarFilaOrgao {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    private readonly montadorCard: MontadorCard,
  ) {}

  async executar(pedido: PedidoFila, agora = new Date()): Promise<PaginaFila> {
    const { orgaoId } = pedido.agente;
    if (orgaoId === null) throw outroOrgao();
    const depoisDe = pedido.cursor ? CursorFeed.decodificar(pedido.cursor) : null;
    const linhas = await this.consultas.filaDoOrgao(
      {
        orgaoId,
        status: pedido.status?.length ? pedido.status : null,
        categorias: pedido.categorias?.length ? pedido.categorias : null,
      },
      depoisDe,
      pedido.limite + 1,
    );
    const pagina = linhas.slice(0, pedido.limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map((linha) => ({
        ...this.montadorCard.montar(linha, agora, true),
        status: linha.status,
        reaberta: linha.reaberturas > 0,
      })),
      proximoCursor:
        linhas.length > pedido.limite && ultima ? CursorFeed.codificar(ultima.posicao) : null,
    };
  }
}

@Injectable()
export class ObterDetalheAtendimento {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    private readonly montadorCard: MontadorCard,
    private readonly urlFotos: UrlFotos,
  ) {}

  async executar(id: string, agente: Agente, agora = new Date()): Promise<DetalheAtendimento> {
    const dados = await this.consultas.detalhe(id);
    if (!dados) throw ocorrenciaNaoEncontrada();
    conferirOrgao(dados.orgaoId, agente);
    return {
      ...montarDetalhe(dados, agora, null, this.montadorCard, this.urlFotos),
      status: dados.status,
      reaberta: dados.reaberturas > 0,
      eventos: dados.eventos,
      transicoesPermitidas: TRANSICOES_AGENTE[dados.status],
    };
  }
}
