import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';
import { formatarNumero } from './painel';

export type Score = components['schemas']['ScoreResposta'];
export type CategoriaScore = components['schemas']['CategoriaScoreResposta'];

export const SEM_DADOS_SUFICIENTES = 'Sem dados suficientes';

export type ResultadoScore = { ok: true; score: Score } | { ok: false; mensagem: string };

/** Sem a cidade, a API responde pela atendida de menor código IBGE. */
export async function buscarScore(api: Api, municipio?: number): Promise<ResultadoScore> {
  try {
    const { data, error } =
      municipio === undefined
        ? await api.GET('/api/v1/indicadores/score')
        : await api.GET('/api/v1/indicadores/score', { params: { query: { municipio } } });
    if (data) return { ok: true, score: data };
    return {
      ok: false,
      mensagem: mensagemDoErro(lerErroApi(error), 'Não foi possível carregar a reputação.'),
    };
  } catch {
    return { ok: false, mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

const NOTA = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "7,0", "6,8", "10,0"; sem nota, um traço. */
export function formatarNotaScore(score: number | null): string {
  return score === null ? '–' : NOTA.format(score);
}

/** "Atualizado em 15/11/2026 às 14:05", no fuso do aparelho. */
export function formatarDataAtualizacao(calculadoEm: string | null): string {
  if (calculadoEm === null) return 'A nota ainda não foi calculada';
  const momento = new Date(calculadoEm);
  const data = momento.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const hora = momento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `Atualizado em ${data} às ${hora}`;
}

/** "12 de 20". */
export function textoResolucaoCategoria(resolvidas: number, total: number): string {
  return `${formatarNumero(resolvidas)} de ${formatarNumero(total)}`;
}

/** Parte resolvida da categoria, de 0 a 100, com uma casa. */
export function proporcaoCategoria(resolvidas: number, total: number): number {
  if (total <= 0) return 0;
  return limitar(arredondar((resolvidas / total) * 100));
}

export interface MedidorScore {
  /** Quanto do anel fica preenchido, de 0 a 100. */
  proporcao: number;
  nota: string;
  rotulo: string;
  /** Texto único para leitores de tela. */
  descricao: string;
}

/**
 * Nota de 0 a 10 vira o preenchimento do anel. O rótulo vem da API, porque as faixas da
 * classificação ficam na configuração do servidor.
 */
export function medidorScore(score: number | null, classificacao: string | null): MedidorScore {
  if (score === null) {
    return {
      proporcao: 0,
      nota: '–',
      rotulo: SEM_DADOS_SUFICIENTES,
      descricao: `Nota da gestão: ${SEM_DADOS_SUFICIENTES.toLowerCase()}`,
    };
  }
  const nota = formatarNotaScore(score);
  const rotulo = classificacao ?? '';
  return {
    proporcao: limitar(arredondar(score * 10)),
    nota,
    rotulo,
    descricao: rotulo
      ? `Nota da gestão: ${nota} de 10, ${rotulo}`
      : `Nota da gestão: ${nota} de 10`,
  };
}

function limitar(valor: number): number {
  return Math.min(100, Math.max(0, valor));
}

function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}
