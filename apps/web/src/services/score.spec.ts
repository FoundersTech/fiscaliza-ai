import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import {
  buscarScore,
  formatarDataAtualizacao,
  formatarNotaScore,
  medidorScore,
  proporcaoCategoria,
  type Score,
  SEM_DADOS_SUFICIENTES,
  textoResolucaoCategoria,
} from './score';

function exemplo(mudancas: Partial<Score> = {}): Score {
  return {
    score: 7,
    classificacao: 'Regular',
    resolvidas_pct: 68,
    dias_mediana: 6.5,
    por_categoria: [{ categoria_id: 1, nome: 'Iluminação', total: 20, resolvidas: 12 }],
    janela_dias: 90,
    calculado_em: '2026-11-15T17:05:00.000Z',
    ...mudancas,
  };
}

describe('buscarScore', () => {
  it('busca o endpoint público do score e devolve os valores', async () => {
    const score = exemplo();
    const GET = vi.fn(() => Promise.resolve({ data: score }));
    const api = { GET } as unknown as Api;

    await expect(buscarScore(api)).resolves.toEqual({ ok: true, score });
    expect(GET).toHaveBeenCalledWith('/api/v1/indicadores/score');
  });

  it('trata erro da API e falha de conexão', async () => {
    const apiErro = {
      GET: vi.fn(() =>
        Promise.resolve({ error: { codigo: 'ERRO', mensagem: 'Indisponível', detalhes: {} } }),
      ),
    } as unknown as Api;
    await expect(buscarScore(apiErro)).resolves.toEqual({ ok: false, mensagem: 'Indisponível' });

    const apiOffline = {
      GET: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    } as unknown as Api;
    await expect(buscarScore(apiOffline)).resolves.toEqual({
      ok: false,
      mensagem: MENSAGEM_SEM_CONEXAO,
    });
  });
});

describe('formatação e medidor do score', () => {
  it('formata nota com uma casa decimal em pt-BR ou traço quando nula', () => {
    expect(formatarNotaScore(7)).toBe('7,0');
    expect(formatarNotaScore(6.8)).toBe('6,8');
    expect(formatarNotaScore(null)).toBe('–');
  });

  it('monta o medidor de 0 a 100 e mostra "Sem dados suficientes" quando nulo', () => {
    expect(medidorScore(7, 'Regular')).toEqual({
      proporcao: 70,
      nota: '7,0',
      rotulo: 'Regular',
      descricao: 'Nota da gestão: 7,0 de 10, Regular',
    });
    expect(medidorScore(null, null)).toEqual({
      proporcao: 0,
      nota: '–',
      rotulo: SEM_DADOS_SUFICIENTES,
      descricao: 'Nota da gestão: sem dados suficientes',
    });
  });

  it('formata resolução por categoria como "X de Y", proporção e data de atualização', () => {
    expect(textoResolucaoCategoria(12, 20)).toBe('12 de 20');
    expect(proporcaoCategoria(12, 20)).toBe(60);
    expect(proporcaoCategoria(0, 0)).toBe(0);
    expect(formatarDataAtualizacao(null)).toBe('A nota ainda não foi calculada');
    expect(formatarDataAtualizacao('2026-11-15T17:05:00.000Z')).toMatch(
      /^Atualizado em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/,
    );
  });
});
