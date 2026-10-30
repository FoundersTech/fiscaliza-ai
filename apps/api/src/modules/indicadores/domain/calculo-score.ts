import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';

export interface ParametrosScore {
  pesos: { resolucao: number; prazo: number; satisfacao: number };
  suavizacao_k: number;
  prior: number;
  faixas: readonly { min: number; rotulo: string }[];
}

export interface DadosDesempenho {
  total: number;
  resolvidas: number;
  noPrazo: number;
  avaliacoes: number;
  mediaAvaliacoes: number | null;
}

export interface ResultadoScore {
  score: number | null;
  classificacao: string | null;
  componentes: { resolucao: number; prazo: number; satisfacao: number } | null;
}

const TOLERANCIA_SOMA = 1e-9;

/**
 * Score de reputação do órgão. Cada componente é suavizado em direção ao `prior`, com peso
 * `suavizacao_k`, para que poucos dados não deem nota extrema.
 */
export class CalculoScore {
  private readonly parametros: ParametrosScore;

  constructor(parametros: ParametrosScore) {
    conferirParametros(parametros);
    this.parametros = parametros;
  }

  calcular(dados: DadosDesempenho): ResultadoScore {
    conferirDados(dados);
    if (dados.total === 0) {
      return { score: null, classificacao: null, componentes: null };
    }

    const { pesos, suavizacao_k: k, prior: p } = this.parametros;
    const suavizar = (acertos: number, casos: number) => (acertos + k * p) / (casos + k);

    // Nota de 1 a 5 vira 0 a 1; sem avaliações, S fica no prior.
    const notaNormalizada = dados.avaliacoes > 0 ? (dados.mediaAvaliacoes! - 1) / 4 : 0;
    const componentes = {
      resolucao: suavizar(dados.resolvidas, dados.total),
      prazo: suavizar(dados.noPrazo, dados.resolvidas),
      satisfacao: suavizar(dados.avaliacoes * notaNormalizada, dados.avaliacoes),
    };

    const ponderado =
      pesos.resolucao * componentes.resolucao +
      pesos.prazo * componentes.prazo +
      pesos.satisfacao * componentes.satisfacao;
    const score = arredondarUmaCasa(10 * ponderado);

    return { score, classificacao: this.classificar(score), componentes };
  }

  /** Rótulo da primeira faixa com `score ≥ min`; as faixas vêm em ordem decrescente. */
  private classificar(score: number): string {
    return this.parametros.faixas.find((faixa) => score >= faixa.min)!.rotulo;
  }
}

/** Ignora o ruído do ponto flutuante (ex.: 6,75 guardado como 6,7499…) antes de arredondar. */
function arredondarUmaCasa(valor: number): number {
  return Math.round(Number((valor * 10).toPrecision(12))) / 10;
}

function conferirParametros({ pesos, suavizacao_k, prior, faixas }: ParametrosScore): void {
  const problemas: string[] = [];

  const valores = [pesos.resolucao, pesos.prazo, pesos.satisfacao];
  const soma = valores.reduce((total, peso) => total + peso, 0);
  if (valores.some((peso) => peso < 0) || Math.abs(soma - 1) > TOLERANCIA_SOMA) {
    problemas.push(`os pesos precisam ser positivos e somar 1 (soma atual: ${soma})`);
  }
  if (!(suavizacao_k > 0)) problemas.push('suavizacao_k precisa ser maior que 0');
  if (!(prior >= 0 && prior <= 1)) problemas.push('prior precisa estar entre 0 e 1');

  const decrescentes = faixas.every(
    (faixa, indice) => indice === 0 || faixa.min < faixas[indice - 1]!.min,
  );
  if (faixas.length === 0 || !decrescentes || faixas.at(-1)!.min !== 0) {
    problemas.push('as faixas precisam vir em ordem decrescente de min e terminar em min 0');
  }

  if (problemas.length) {
    throw new ErroDominio('PARAMETROS_SCORE_INVALIDOS', 'Os parâmetros do score são inválidos.', {
      problemas,
    });
  }
}

function conferirDados(dados: DadosDesempenho): void {
  const { total, resolvidas, noPrazo, avaliacoes, mediaAvaliacoes } = dados;
  const contagens = [total, resolvidas, noPrazo, avaliacoes];
  const coerente =
    contagens.every((valor) => Number.isInteger(valor) && valor >= 0) &&
    resolvidas <= total &&
    noPrazo <= resolvidas &&
    (avaliacoes === 0
      ? mediaAvaliacoes === null
      : mediaAvaliacoes !== null && mediaAvaliacoes >= 1 && mediaAvaliacoes <= 5);

  if (!coerente) {
    throw new ErroDominio('DADOS_SCORE_INVALIDOS', 'Os dados de desempenho são incoerentes.', {
      ...dados,
    });
  }
}
