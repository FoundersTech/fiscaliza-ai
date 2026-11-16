import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { Score } from '@/services/score';

import { useScoreStore } from './score';

function resposta(score: Score | null, atrasoMs = 0) {
  return new Promise<{ data?: Score; error?: unknown }>((resolver) => {
    setTimeout(() => {
      if (score) resolver({ data: score });
      else resolver({ error: { codigo: 'ERRO', mensagem: 'Falhou', detalhes: {} } });
    }, atrasoMs);
  });
}

function exemplo(nota: number | null): Score {
  return {
    score: nota,
    classificacao: nota === null ? null : 'Regular',
    resolvidas_pct: nota === null ? null : 68,
    dias_mediana: nota === null ? null : 6.5,
    por_categoria: [],
    janela_dias: 90,
    calculado_em: '2026-11-15T17:05:00.000Z',
  };
}

describe('useScoreStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('garantir busca uma vez só quando ainda não há score carregado', async () => {
    const score = exemplo(7);
    const GET = vi.fn(() => resposta(score));
    const api = { GET } as unknown as Api;
    const loja = useScoreStore();

    await loja.garantir(api);
    await loja.garantir(api);

    expect(GET).toHaveBeenCalledTimes(1);
    expect(loja.score).toEqual(score);
    expect(loja.erro).toBeNull();
  });

  it('carregar força nova busca e descarta resposta atrasada de pedido anterior', async () => {
    const antigo = exemplo(5);
    const novo = exemplo(8.2);
    const GET = vi
      .fn()
      .mockImplementationOnce(() => resposta(antigo, 30))
      .mockImplementationOnce(() => resposta(novo, 5));
    const api = { GET } as unknown as Api;
    const loja = useScoreStore();

    const p1 = loja.carregar(api);
    const p2 = loja.carregar(api);
    await Promise.all([p1, p2]);

    expect(loja.score).toEqual(novo);
    expect(loja.carregando).toBe(false);
  });

  it('guarda erro e limpa o score quando a busca falha', async () => {
    const GET = vi.fn(() => resposta(null));
    const api = { GET } as unknown as Api;
    const loja = useScoreStore();

    await loja.carregar(api);

    expect(loja.score).toBeNull();
    expect(loja.erro).toBe('Falhou');
  });
});
