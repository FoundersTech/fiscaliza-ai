import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type Painel = components['schemas']['PainelResposta'];
export type CategoriaPainel = components['schemas']['CategoriaPainelResposta'];
export type PeriodoPainel = Painel['periodo_dias'];

export const PERIODOS: readonly { dias: PeriodoPainel; rotulo: string }[] = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
];
export const PERIODO_PADRAO: PeriodoPainel = 30;

export const SEM_OCORRENCIAS = 'Sem ocorrências no período';

export interface FiltrosPainel {
  periodo: PeriodoPainel;
  /** Slugs; vazio quer dizer todas as categorias. */
  categorias: readonly string[];
}

export type ResultadoPainel = { ok: true; painel: Painel } | { ok: false; mensagem: string };

/** A consulta da API: a categoria só vai quando há alguma escolhida, em ordem fixa. */
export function consultaDoPainel(filtros: FiltrosPainel): {
  periodo: PeriodoPainel;
  categoria?: string;
} {
  const categorias = [...new Set(filtros.categorias)].sort();
  return categorias.length
    ? { periodo: filtros.periodo, categoria: categorias.join(',') }
    : { periodo: filtros.periodo };
}

export async function buscarPainel(api: Api, filtros: FiltrosPainel): Promise<ResultadoPainel> {
  try {
    const { data, error } = await api.GET('/api/v1/indicadores/painel', {
      params: { query: consultaDoPainel(filtros) },
    });
    if (data) return { ok: true, painel: data };
    return {
      ok: false,
      mensagem: mensagemDoErro(lerErroApi(error), 'Não foi possível carregar o painel.'),
    };
  } catch {
    return { ok: false, mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatarNumero(valor: number): string {
  return NUMERO.format(valor);
}

/** "55%", "33,3%"; sem valor, um traço. */
export function formatarPercentual(valor: number | null): string {
  return valor === null ? '–' : `${NUMERO.format(valor)}%`;
}

/** "1 dia", "6,5 dias"; sem nenhuma resolvida, um traço. */
export function formatarDias(valor: number | null): string {
  if (valor === null) return '–';
  return valor === 1 ? '1 dia' : `${NUMERO.format(valor)} dias`;
}

/** "Atualizado às 14:05", no fuso do aparelho. */
export function formatarAtualizacao(calculadoEm: string): string {
  const hora = new Date(calculadoEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Atualizado às ${hora}`;
}

export interface BarraCategoria extends CategoriaPainel {
  /** Largura da barra, em % da maior categoria. */
  largura: number;
  /** Parte resolvida, em % da própria barra. */
  resolvidasLargura: number;
}

/** Barras proporcionais à categoria com mais ocorrências, que ocupa a largura toda. */
export function barrasPorCategoria(categorias: readonly CategoriaPainel[]): BarraCategoria[] {
  const maior = Math.max(0, ...categorias.map((categoria) => categoria.total));
  return categorias.map((categoria) => ({
    ...categoria,
    largura: maior ? arredondar((categoria.total / maior) * 100) : 0,
    resolvidasLargura: categoria.total
      ? arredondar((categoria.resolvidas / categoria.total) * 100)
      : 0,
  }));
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}
