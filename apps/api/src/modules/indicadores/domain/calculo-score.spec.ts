import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validarParametros } from '../../../shared/config/parametros.js';
import { CalculoScore, type DadosDesempenho, type ParametrosScore } from './calculo-score.js';

/** Os valores do design ("Parâmetros [provisórios]"). */
function parametros(mudancas: Partial<ParametrosScore> = {}): ParametrosScore {
  return {
    pesos: { resolucao: 0.5, prazo: 0.3, satisfacao: 0.2 },
    suavizacao_k: 10,
    prior: 0.7,
    faixas: [
      { min: 9.0, rotulo: 'Ótimo' },
      { min: 7.5, rotulo: 'Bom' },
      { min: 6.0, rotulo: 'Regular' },
      { min: 4.0, rotulo: 'Fraco' },
      { min: 0.0, rotulo: 'Ruim' },
    ],
    ...mudancas,
  };
}

const USO_NORMAL: DadosDesempenho = {
  total: 100,
  resolvidas: 68,
  noPrazo: 50,
  avaliacoes: 40,
  mediaAvaliacoes: 3.8,
};

const POUCOS_DADOS: DadosDesempenho = {
  total: 1,
  resolvidas: 1,
  noPrazo: 1,
  avaliacoes: 1,
  mediaAvaliacoes: 5,
};

const SEM_DADOS: DadosDesempenho = {
  total: 0,
  resolvidas: 0,
  noPrazo: 0,
  avaliacoes: 0,
  mediaAvaliacoes: null,
};

function codigo(acao: () => unknown): string | undefined {
  try {
    acao();
  } catch (erro) {
    return (erro as { codigo?: string }).codigo;
  }
  return undefined;
}

describe('CalculoScore: exemplos de referência do design (CA-10.5)', () => {
  const calculo = new CalculoScore(parametros());

  it('uso normal dá 7,0 "Regular"', () => {
    const resultado = calculo.calcular(USO_NORMAL);

    expect(resultado).toMatchObject({ score: 7.0, classificacao: 'Regular' });
    expect(resultado.componentes!.resolucao).toBeCloseTo(0.6818, 4);
    expect(resultado.componentes!.prazo).toBeCloseTo(0.7308, 4);
    expect(resultado.componentes!.satisfacao).toBeCloseTo(0.7, 4);
  });

  it('poucos dados dá 7,3, e não 10 (CA-10.6)', () => {
    const resultado = calculo.calcular(POUCOS_DADOS);

    expect(resultado.score).toBe(7.3);
    expect(resultado.classificacao).toBe('Regular');
    for (const componente of Object.values(resultado.componentes!)) {
      expect(componente).toBeCloseTo(0.7273, 4);
    }
  });

  it('total = 0 dá score nulo', () => {
    expect(calculo.calcular(SEM_DADOS)).toEqual({
      score: null,
      classificacao: null,
      componentes: null,
    });
  });
});

describe('CalculoScore: fórmula (CA-10.1)', () => {
  const calculo = new CalculoScore(parametros());

  it('sem avaliações, a satisfação fica no prior', () => {
    const resultado = calculo.calcular({ ...USO_NORMAL, avaliacoes: 0, mediaAvaliacoes: null });
    expect(resultado.componentes!.satisfacao).toBe(0.7);
  });

  it('sem resolvidas, o prazo fica no prior', () => {
    const resultado = calculo.calcular({ ...SEM_DADOS, total: 5 });
    expect(resultado.componentes!.prazo).toBe(0.7);
  });

  it('nos extremos, vai de 2,1 a 10', () => {
    const tudoBem = calculo.calcular({
      total: 10_000,
      resolvidas: 10_000,
      noPrazo: 10_000,
      avaliacoes: 10_000,
      mediaAvaliacoes: 5,
    });
    const tudoMal = calculo.calcular({
      total: 10_000,
      resolvidas: 0,
      noPrazo: 0,
      avaliacoes: 10_000,
      mediaAvaliacoes: 1,
    });

    expect(tudoBem).toMatchObject({ score: 10, classificacao: 'Ótimo' });
    // Sem nenhuma resolvida, o prazo fica no prior: 10 · 0,3 · 0,7 = 2,1 é o piso da fórmula.
    expect(tudoMal).toMatchObject({ score: 2.1, classificacao: 'Ruim' });
  });

  it('o score tem uma casa decimal', () => {
    for (let resolvidas = 0; resolvidas <= 50; resolvidas++) {
      const { score } = calculo.calcular({ ...SEM_DADOS, total: 50, resolvidas });
      expect(score).toBe(Number(score!.toFixed(1)));
    }
  });
});

describe('CalculoScore: parâmetros da configuração (CA-10.2, CA-10.3)', () => {
  it('aceita o parametros.json do repositório', () => {
    const arquivo = new URL('../../../../config/parametros.json', import.meta.url);
    const { score } = validarParametros(JSON.parse(readFileSync(arquivo, 'utf8')));

    // Sem valor fixo: o arquivo pode mudar (CA-10.3) sem quebrar este teste.
    expect(new CalculoScore(score).calcular(USO_NORMAL).score).toEqual(expect.any(Number));
  });

  it('mudar os pesos muda o score', () => {
    const soResolucao = new CalculoScore(
      parametros({ pesos: { resolucao: 1, prazo: 0, satisfacao: 0 } }),
    );
    // 10 · R = 10 · 0,6818
    expect(soResolucao.calcular(USO_NORMAL).score).toBe(6.8);
  });

  it('mudar as faixas muda a classificação', () => {
    const exigente = new CalculoScore(
      parametros({
        faixas: [
          { min: 7.5, rotulo: 'Aceitável' },
          { min: 0, rotulo: 'Insuficiente' },
        ],
      }),
    );
    expect(exigente.calcular(USO_NORMAL).classificacao).toBe('Insuficiente');
  });

  it.each([
    [6.0, 'Regular'],
    [7.5, 'Bom'],
    [9.0, 'Ótimo'],
  ])('score %s exatamente no limite entra na faixa %s', (limite, rotulo) => {
    // Só resolução com k pequeno: score = 10 · resolvidas / total.
    const calculo = new CalculoScore(
      parametros({ pesos: { resolucao: 1, prazo: 0, satisfacao: 0 }, suavizacao_k: 1e-9 }),
    );
    const resultado = calculo.calcular({ ...SEM_DADOS, total: 1000, resolvidas: limite * 100 });
    expect(resultado).toMatchObject({ score: limite, classificacao: rotulo });
  });

  it.each<[string, Partial<ParametrosScore>]>([
    ['pesos que somam 0,9', { pesos: { resolucao: 0.5, prazo: 0.3, satisfacao: 0.1 } }],
    ['pesos que somam 1,1', { pesos: { resolucao: 0.6, prazo: 0.3, satisfacao: 0.2 } }],
    ['peso negativo', { pesos: { resolucao: 1.2, prazo: -0.2, satisfacao: 0 } }],
    ['suavização zero', { suavizacao_k: 0 }],
    ['prior acima de 1', { prior: 1.5 }],
    [
      'faixas fora de ordem',
      {
        faixas: [
          { min: 0, rotulo: 'Ruim' },
          { min: 9, rotulo: 'Ótimo' },
        ],
      },
    ],
    ['faixas sem min 0', { faixas: [{ min: 5, rotulo: 'Regular' }] }],
    ['sem faixas', { faixas: [] }],
  ])('%s lança erro', (_caso, mudancas) => {
    expect(codigo(() => new CalculoScore(parametros(mudancas)))).toBe('PARAMETROS_SCORE_INVALIDOS');
  });
});

describe('CalculoScore: dados incoerentes', () => {
  const calculo = new CalculoScore(parametros());

  it.each<[string, Partial<DadosDesempenho>]>([
    ['mais resolvidas que o total', { resolvidas: 101 }],
    ['mais no prazo que resolvidas', { noPrazo: 69 }],
    ['contagem negativa', { avaliacoes: -1 }],
    ['contagem fracionária', { total: 100.5 }],
    ['avaliações sem média', { mediaAvaliacoes: null }],
    ['média fora de 1 a 5', { mediaAvaliacoes: 5.5 }],
    ['média sem avaliações', { avaliacoes: 0 }],
  ])('%s lança erro', (_caso, mudancas) => {
    expect(codigo(() => calculo.calcular({ ...USO_NORMAL, ...mudancas }))).toBe(
      'DADOS_SCORE_INVALIDOS',
    );
  });
});
