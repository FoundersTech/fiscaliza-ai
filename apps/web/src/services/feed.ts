import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type CardOcorrencia = components['schemas']['CardResposta'];
export type StatusPublico = CardOcorrencia['status_publico'];

export interface FiltrosFeed {
  /** Slug da categoria; null mostra todas. */
  categoria: string | null;
  /** null mostra todos os status. */
  status: StatusPublico | null;
}

export interface PedidoPagina extends FiltrosFeed {
  municipio?: number | undefined;
  cursor?: string | null;
}

export type ResultadoPagina =
  | { tipo: 'OK'; itens: CardOcorrencia[]; proximoCursor: string | null }
  | { tipo: 'ERRO'; mensagem: string };

export const ITENS_POR_PAGINA = 20;
export const FILTROS_VAZIOS: FiltrosFeed = { categoria: null, status: null };

const MENSAGEM_FEED = 'Não foi possível carregar as ocorrências. Tente de novo.';

/** Os status na ordem do atendimento, com o texto que aparece no app. */
export const STATUS_PUBLICOS: { valor: StatusPublico; rotulo: string }[] = [
  { valor: 'RECEBIDO', rotulo: 'Recebido' },
  { valor: 'EM_ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvido' },
];

export function rotuloDoStatus(status: StatusPublico): string {
  return STATUS_PUBLICOS.find((item) => item.valor === status)?.rotulo ?? status;
}

/** Rodapé do card: há quanto tempo está aberta, ou quanto levou para ser resolvida. */
export function textoDosDias(dias: number, status: StatusPublico): string {
  if (status === 'RESOLVIDO') {
    if (dias === 0) return 'Resolvido no mesmo dia';
    return dias === 1 ? 'Resolvido em 1 dia' : `Resolvido em ${dias} dias`;
  }
  if (dias === 0) return 'Aberta hoje';
  return dias === 1 ? '1 dia em aberto' : `${dias} dias em aberto`;
}

/** Uma página do feed. Só manda os filtros escolhidos: sem eles, a API devolve tudo. */
export async function buscarPagina(api: Api, pedido: PedidoPagina): Promise<ResultadoPagina> {
  try {
    const { data, error } = await api.GET('/api/v1/ocorrencias', {
      params: {
        query: {
          limite: ITENS_POR_PAGINA,
          ...(pedido.municipio !== undefined && { municipio: pedido.municipio }),
          ...(pedido.categoria && { categoria: pedido.categoria }),
          ...(pedido.status && { status: pedido.status }),
          ...(pedido.cursor && { cursor: pedido.cursor }),
        },
      },
    });
    if (!data) return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_FEED) };
    return { tipo: 'OK', itens: data.itens, proximoCursor: data.proximo_cursor };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}
