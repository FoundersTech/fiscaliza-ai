import { describe, expect, it } from 'vitest';

import { montarPainel } from './painel.js';

const categoria = (slug: string, nome: string, total: number, resolvidas: number) => ({
  slug,
  nome,
  icone: 'x',
  total,
  resolvidas,
});

describe('montarPainel', () => {
  it('sem ocorrências fica vazio, com percentual e mediana nulos em vez de zero', () => {
    const painel = montarPainel(30, {
      total: 0,
      resolvidas: 0,
      diasMediana: null,
      porCategoria: [],
    });
    expect(painel).toEqual({
      vazio: true,
      periodoDias: 30,
      total: 0,
      resolvidas: 0,
      resolvidasPct: null,
      diasMediana: null,
      porCategoria: [],
    });
  });

  it('calcula o percentual de resolvidas e arredonda para uma casa', () => {
    const painel = montarPainel(90, {
      total: 3,
      resolvidas: 1,
      diasMediana: 4.25,
      porCategoria: [],
    });
    expect(painel.vazio).toBe(false);
    expect(painel.resolvidasPct).toBe(33.3);
    expect(painel.diasMediana).toBe(4.3);
  });

  it('mantém a mediana nula quando nada foi resolvido', () => {
    const painel = montarPainel(365, {
      total: 2,
      resolvidas: 0,
      diasMediana: null,
      porCategoria: [],
    });
    expect(painel.resolvidasPct).toBe(0);
    expect(painel.diasMediana).toBeNull();
  });

  it('ordena as categorias da maior para a menor, pelo nome no empate, e tira as zeradas', () => {
    const painel = montarPainel(30, {
      total: 6,
      resolvidas: 2,
      diasMediana: 1,
      porCategoria: [
        categoria('limpeza-urbana', 'Limpeza urbana', 1, 0),
        categoria('pavimentacao', 'Pavimentação', 2, 1),
        categoria('agua-esgoto', 'Água e esgoto', 0, 0),
        categoria('iluminacao', 'Iluminação', 2, 1),
        categoria('outra', 'Outra', 1, 0),
      ],
    });
    expect(painel.porCategoria.map((item) => item.slug)).toEqual([
      'iluminacao',
      'pavimentacao',
      'limpeza-urbana',
      'outra',
    ]);
  });
});
