import { describe, expect, it, vi } from 'vitest';

import type { Parametros } from '../../../shared/config/parametros.js';
import { ObterScore } from './obter-score.js';
import type { AgregadoOrgao, DesempenhoOrgao, DesempenhoOrgaos } from './portas.js';
import { RecalcularScore } from './recalcular-score.js';

const AGORA = new Date('2026-11-15T15:00:00Z');

function criarParametros(mudancas: Partial<Parametros['score']> = {}): Parametros {
  return {
    score: {
      janela_dias: 90,
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
      recalculo_cron: '0 * * * *',
      ...mudancas,
    },
    urgente_min_confirmacoes: 10,
    duplicidade_raio_m: 60,
    janela_pos_resolucao_dias: 10,
    moderacao_estrategia: 'APROVAR_TUDO',
  };
}

function repositorioMemoria(agregados: Record<number, AgregadoOrgao> = {}) {
  const gravados = new Map<number, DesempenhoOrgao>();
  const orgaos = Object.keys(agregados).map((id) => ({
    orgaoId: Number(id),
    municipioId: 3552205 + Number(id) - 1,
  }));

  const porta: DesempenhoOrgaos = {
    orgaosAtivos: vi.fn(() => Promise.resolve(orgaos)),
    agregar: vi.fn((orgaoId: number) => Promise.resolve(agregados[orgaoId]!)),
    gravar: vi.fn((desempenho: DesempenhoOrgao) => {
      gravados.set(desempenho.orgaoId, desempenho);
      return Promise.resolve();
    }),
    ler: vi.fn((municipioId: number | null) => {
      const orgao =
        municipioId === null ? orgaos[0] : orgaos.find((item) => item.municipioId === municipioId);
      if (!orgao) return Promise.resolve(undefined);
      return Promise.resolve({ desempenho: gravados.get(orgao.orgaoId) ?? null });
    }),
  };

  return { porta, gravados };
}

describe('RecalcularScore', () => {
  it('calcula o score do órgão a partir da agregação e grava em desempenho_orgao', async () => {
    const { porta, gravados } = repositorioMemoria({
      1: {
        total: 100,
        resolvidas: 68,
        noPrazo: 50,
        diasMediana: 6.24,
        avaliacoes: 40,
        satisfacaoMedia: 3.8,
        porCategoria: [{ categoriaId: 1, nome: 'Iluminação', total: 100, resolvidas: 68 }],
      },
    });
    const caso = new RecalcularScore(porta, criarParametros());

    await caso.executar(AGORA);

    expect(gravados.get(1)).toMatchObject({
      orgaoId: 1,
      municipioId: 3552205,
      janelaDias: 90,
      total: 100,
      resolvidas: 68,
      noPrazo: 50,
      avaliacoes: 40,
      satisfacaoMedia: 3.8,
      score: 7.0,
      classificacao: 'Regular',
      calculadoEm: AGORA,
    });
  });

  it('grava score e classificação nulos quando o órgão não tem ocorrências', async () => {
    const { porta, gravados } = repositorioMemoria({
      1: {
        total: 0,
        resolvidas: 0,
        noPrazo: 0,
        diasMediana: null,
        avaliacoes: 0,
        satisfacaoMedia: null,
        porCategoria: [],
      },
    });
    const caso = new RecalcularScore(porta, criarParametros());

    await caso.executar(AGORA);

    expect(gravados.get(1)).toMatchObject({
      total: 0,
      score: null,
      classificacao: null,
      calculadoEm: AGORA,
    });
  });

  it('mudar os pesos nos parâmetros altera o score recalculado', async () => {
    const agregado: AgregadoOrgao = {
      total: 100,
      resolvidas: 90,
      noPrazo: 20,
      diasMediana: 10,
      avaliacoes: 20,
      satisfacaoMedia: 2,
      porCategoria: [],
    };
    const { porta: p1, gravados: g1 } = repositorioMemoria({ 1: agregado });
    await new RecalcularScore(p1, criarParametros()).executar(AGORA);

    const { porta: p2, gravados: g2 } = repositorioMemoria({ 1: agregado });
    await new RecalcularScore(
      p2,
      criarParametros({ pesos: { resolucao: 0.8, prazo: 0.1, satisfacao: 0.1 } }),
    ).executar(AGORA);

    expect(g2.get(1)!.score).not.toBe(g1.get(1)!.score);
    expect(g2.get(1)!.score!).toBeGreaterThan(g1.get(1)!.score!);
  });

  it('mantém o valor anterior de um órgão quando a agregação falha e segue para os outros', async () => {
    const { porta, gravados } = repositorioMemoria({
      1: {
        total: 10,
        resolvidas: 8,
        noPrazo: 8,
        diasMediana: 2,
        avaliacoes: 5,
        satisfacaoMedia: 4.5,
        porCategoria: [],
      },
      2: {
        total: 10,
        resolvidas: 5,
        noPrazo: 4,
        diasMediana: 4,
        avaliacoes: 2,
        satisfacaoMedia: 3.0,
        porCategoria: [],
      },
    });
    const antigo = new Date('2026-11-15T14:00:00Z');
    await new RecalcularScore(porta, criarParametros()).executar(antigo);

    vi.spyOn(porta, 'agregar').mockImplementationOnce(() =>
      Promise.reject(new Error('falha momentânea no banco')),
    );

    await new RecalcularScore(porta, criarParametros()).executar(AGORA);

    expect(gravados.get(1)!.calculadoEm).toEqual(antigo);
    expect(gravados.get(2)!.calculadoEm).toEqual(AGORA);
  });
});

describe('ObterScore', () => {
  it('quando ainda não foi calculado, devolve campos nulos sem erro', async () => {
    const { porta } = repositorioMemoria({
      1: {
        total: 0,
        resolvidas: 0,
        noPrazo: 0,
        diasMediana: null,
        avaliacoes: 0,
        satisfacaoMedia: null,
        porCategoria: [],
      },
    });
    const caso = new ObterScore(porta, criarParametros());

    expect(await caso.executar(null)).toEqual({
      score: null,
      classificacao: null,
      resolvidasPct: null,
      diasMediana: null,
      porCategoria: [],
      janelaDias: 90,
      calculadoEm: null,
    });
  });

  it('arredonda resolvidas_pct e dias_mediana para uma casa e preserva por_categoria', async () => {
    const { porta } = repositorioMemoria({
      1: {
        total: 3,
        resolvidas: 2,
        noPrazo: 2,
        diasMediana: 4.26,
        avaliacoes: 1,
        satisfacaoMedia: 5,
        porCategoria: [{ categoriaId: 3, nome: 'Iluminação', total: 3, resolvidas: 2 }],
      },
    });
    const parametros = criarParametros();
    await new RecalcularScore(porta, parametros).executar(AGORA);

    const resposta = await new ObterScore(porta, parametros).executar(3552205);

    expect(resposta).toMatchObject({
      resolvidasPct: 66.7,
      diasMediana: 4.3,
      janelaDias: 90,
      calculadoEm: AGORA,
      porCategoria: [{ categoriaId: 3, nome: 'Iluminação', total: 3, resolvidas: 2 }],
    });
    expect(resposta.score).not.toBeNull();
  });

  it('devolve erro 404 quando o município não tem órgão ativo', async () => {
    const { porta } = repositorioMemoria({});
    const caso = new ObterScore(porta, criarParametros());

    await expect(caso.executar(9999999)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      status: 404,
    });
  });
});
