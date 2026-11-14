import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type { Painel, PeriodoPainel } from '@/services/painel';

import { usePainelStore } from './painel';

const CALCULADO_EM = '2026-11-14T13:00:00.000Z';

const POR_PERIODO: Record<PeriodoPainel, Painel> = {
  30: {
    vazio: false,
    periodo_dias: 30,
    total: 4,
    resolvidas: 1,
    resolvidas_pct: 25,
    dias_mediana: 3,
    por_categoria: [
      { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', total: 4, resolvidas: 1 },
    ],
    calculado_em: CALCULADO_EM,
  },
  90: {
    vazio: false,
    periodo_dias: 90,
    total: 10,
    resolvidas: 6,
    resolvidas_pct: 60,
    dias_mediana: 7.5,
    por_categoria: [
      { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', total: 7, resolvidas: 4 },
      { slug: 'limpeza', nome: 'Limpeza', icone: 'delete', total: 3, resolvidas: 2 },
    ],
    calculado_em: CALCULADO_EM,
  },
  365: {
    vazio: false,
    periodo_dias: 365,
    total: 30,
    resolvidas: 20,
    resolvidas_pct: 66.7,
    dias_mediana: 9,
    por_categoria: [
      { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', total: 30, resolvidas: 20 },
    ],
    calculado_em: CALCULADO_EM,
  },
};

const VAZIO: Painel = {
  vazio: true,
  periodo_dias: 30,
  total: 0,
  resolvidas: 0,
  resolvidas_pct: null,
  dias_mediana: null,
  por_categoria: [],
  calculado_em: CALCULADO_EM,
};

type Consulta = { periodo: PeriodoPainel; categoria?: string };

/** Uma API falsa que responde pelo período, e vazio para a categoria "arvores". */
function criarApi() {
  const get = vi.fn((_rota: string, { params }: { params: { query: Consulta } }) => {
    const { periodo, categoria } = params.query;
    const data =
      categoria === 'arvores' ? { ...VAZIO, periodo_dias: periodo } : POR_PERIODO[periodo];
    return Promise.resolve({ data });
  });
  return { api: { GET: get } as unknown as Api, get };
}

const ultimaConsulta = (get: ReturnType<typeof vi.fn>): unknown => get.mock.lastCall?.[1];

describe('store do painel', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('abre nos últimos 30 dias, com todas as categorias', async () => {
    const { api, get } = criarApi();
    const painel = usePainelStore();

    await painel.carregar(api);

    expect(ultimaConsulta(get)).toEqual({ params: { query: { periodo: 30 } } });
    expect(painel.periodo).toBe(30);
    expect(painel.painel?.total).toBe(4);
    expect(painel.carregando).toBe(false);
  });

  it('trocar o período busca de novo e muda todos os números', async () => {
    const { api, get } = criarApi();
    const painel = usePainelStore();
    await painel.carregar(api);
    const antes = painel.painel;

    await painel.escolherPeriodo(api, 90);

    expect(ultimaConsulta(get)).toEqual({ params: { query: { periodo: 90 } } });
    const depois = painel.painel;
    expect(depois?.periodo_dias).toBe(90);
    expect(depois?.total).not.toBe(antes?.total);
    expect(depois?.resolvidas_pct).not.toBe(antes?.resolvidas_pct);
    expect(depois?.dias_mediana).not.toBe(antes?.dias_mediana);
    expect(depois?.por_categoria).not.toEqual(antes?.por_categoria);

    await painel.escolherPeriodo(api, 365);
    expect(painel.painel).toEqual(POR_PERIODO[365]);
  });

  it('uma categoria sem dados no período deixa o painel vazio, sem percentuais', async () => {
    const { api, get } = criarApi();
    const painel = usePainelStore();
    await painel.carregar(api);

    await painel.alternarCategoria(api, 'arvores');

    expect(ultimaConsulta(get)).toEqual({
      params: { query: { periodo: 30, categoria: 'arvores' } },
    });
    expect(painel.painel?.vazio).toBe(true);
    expect(painel.painel?.resolvidas_pct).toBeNull();
  });

  it('liga e desliga categorias e volta para todas', async () => {
    const { api, get } = criarApi();
    const painel = usePainelStore();

    await painel.alternarCategoria(api, 'limpeza');
    await painel.alternarCategoria(api, 'iluminacao');
    expect(ultimaConsulta(get)).toEqual({
      params: { query: { periodo: 30, categoria: 'iluminacao,limpeza' } },
    });

    await painel.alternarCategoria(api, 'limpeza');
    expect(painel.categorias).toEqual(['iluminacao']);

    await painel.todasCategorias(api);
    expect(painel.categorias).toEqual([]);
    expect(ultimaConsulta(get)).toEqual({ params: { query: { periodo: 30 } } });

    const pedidos = get.mock.calls.length;
    await painel.todasCategorias(api);
    expect(get.mock.calls.length).toBe(pedidos);
  });

  it('a resposta de um filtro antigo não aparece por cima do filtro atual', async () => {
    const { api, get } = criarApi();
    let responderLento: (valor: { data: Painel }) => void = () => undefined;
    get.mockImplementationOnce(
      () => new Promise((resolver) => (responderLento = resolver)) as never,
    );
    const painel = usePainelStore();

    const primeiro = painel.escolherPeriodo(api, 90);
    await painel.escolherPeriodo(api, 365);
    responderLento({ data: POR_PERIODO[90] });
    await primeiro;

    expect(painel.periodo).toBe(365);
    expect(painel.painel?.periodo_dias).toBe(365);
    expect(painel.carregando).toBe(false);
  });

  it('se a API falhar, guarda a mensagem e não mostra números antigos', async () => {
    const { api, get } = criarApi();
    const painel = usePainelStore();
    await painel.carregar(api);

    get.mockRejectedValueOnce(new TypeError('fetch'));
    await painel.escolherPeriodo(api, 90);

    expect(painel.painel).toBeNull();
    expect(painel.erro).toMatch(/conexão/);
  });
});
