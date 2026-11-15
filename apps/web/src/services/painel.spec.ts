import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import {
  barrasPorCategoria,
  buscarPainel,
  consultaDoPainel,
  formatarDias,
  formatarPercentual,
} from './painel';

function apiQueResponde(resposta: unknown): { api: Api; get: ReturnType<typeof vi.fn> } {
  const get = vi.fn().mockResolvedValue(resposta);
  return { api: { GET: get } as unknown as Api, get };
}

describe('consulta do painel', () => {
  it('sem categoria escolhida, manda só o período', () => {
    expect(consultaDoPainel({ periodo: 90, categorias: [] })).toEqual({ periodo: 90 });
  });

  it('junta as categorias por vírgula, em ordem fixa e sem repetir', () => {
    expect(
      consultaDoPainel({ periodo: 30, categorias: ['pavimentacao', 'iluminacao', 'iluminacao'] }),
    ).toEqual({ periodo: 30, categoria: 'iluminacao,pavimentacao' });
  });
});

describe('buscarPainel', () => {
  it('pede o painel público com os filtros escolhidos', async () => {
    const painel = { vazio: true };
    const { api, get } = apiQueResponde({ data: painel });

    await expect(buscarPainel(api, { periodo: 365, categorias: ['iluminacao'] })).resolves.toEqual({
      ok: true,
      painel,
    });
    expect(get).toHaveBeenCalledWith('/api/v1/indicadores/painel', {
      params: { query: { periodo: 365, categoria: 'iluminacao' } },
    });
  });

  it('mostra a mensagem da API quando ela recusa o filtro', async () => {
    const { api } = apiQueResponde({
      error: { codigo: 'VALIDACAO', mensagem: 'Dados inválidos.', detalhes: {} },
    });
    await expect(buscarPainel(api, { periodo: 30, categorias: [] })).resolves.toEqual({
      ok: false,
      mensagem: 'Dados inválidos.',
    });
  });

  it('sem conexão, pede para conferir a rede', async () => {
    const api = { GET: vi.fn().mockRejectedValue(new TypeError('fetch')) } as unknown as Api;
    await expect(buscarPainel(api, { periodo: 30, categorias: [] })).resolves.toEqual({
      ok: false,
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });
});

describe('formatação dos números', () => {
  it('percentual com vírgula decimal e traço quando não há valor', () => {
    expect(formatarPercentual(55)).toBe('55%');
    expect(formatarPercentual(33.3)).toBe('33,3%');
    expect(formatarPercentual(null)).toBe('–');
  });

  it('mediana em dias, no singular para um dia', () => {
    expect(formatarDias(1)).toBe('1 dia');
    expect(formatarDias(6.5)).toBe('6,5 dias');
    expect(formatarDias(0)).toBe('0 dias');
    expect(formatarDias(null)).toBe('–');
  });
});

describe('barras por categoria', () => {
  it('a maior categoria ocupa a largura toda e as outras ficam na proporção', () => {
    const barras = barrasPorCategoria([
      { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', total: 8, resolvidas: 2 },
      { slug: 'limpeza', nome: 'Limpeza', icone: 'delete', total: 3, resolvidas: 3 },
      { slug: 'arvores', nome: 'Árvores', icone: 'park', total: 1, resolvidas: 0 },
    ]);
    expect(barras.map(({ largura, resolvidasLargura }) => [largura, resolvidasLargura])).toEqual([
      [100, 25],
      [37.5, 100],
      [12.5, 0],
    ]);
  });

  it('sem categorias, não há barras', () => {
    expect(barrasPorCategoria([])).toEqual([]);
  });
});
