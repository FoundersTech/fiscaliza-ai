import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Api } from '@/services/api';
import type * as ServicoFeed from '@/services/feed';
import {
  buscarPagina,
  type CardOcorrencia,
  type PedidoPagina,
  type ResultadoPagina,
} from '@/services/feed';
import { type ConfigPublica, useConfigStore } from '@/stores/config';

import { useFeedStore, VALIDADE_FEED_MS } from './feed';

vi.mock('@/services/feed', async (original) => ({
  ...(await original<typeof ServicoFeed>()),
  buscarPagina: vi.fn(),
}));

const buscar = vi.mocked(buscarPagina);
const API = {} as Api;

function card(id: string, mudancas: Partial<CardOcorrencia> = {}): CardOcorrencia {
  return {
    id,
    protocolo: `FA-2026-SOR-${id.padStart(6, '0')}`,
    categoria: { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb' },
    status_publico: 'RECEBIDO',
    resumo: 'Poste apagado na esquina',
    endereco: 'Rua Quinze de Novembro, 482 · Centro',
    confirmacoes: 0,
    urgente: false,
    dias_em_aberto: 2,
    miniatura_url: null,
    foto_em_analise: true,
    criada_em: '2026-11-14T12:00:00.000Z',
    ...mudancas,
  };
}

const pagina = (itens: CardOcorrencia[], proximoCursor: string | null = null): ResultadoPagina => ({
  tipo: 'OK',
  itens,
  proximoCursor,
});

/** O pedido da n-ésima chamada à API (começando em 0). */
const pedido = (n: number): PedidoPagina => buscar.mock.calls[n]![1];

/** Uma resposta que só chega quando o teste mandar. */
function adiada() {
  let entregar!: (resultado: ResultadoPagina) => void;
  const promessa = new Promise<ResultadoPagina>((resolver) => (entregar = resolver));
  return { promessa, entregar };
}

describe('store do feed', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    buscar.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('abre sem filtros e mostra a primeira página', async () => {
    buscar.mockResolvedValueOnce(pagina([card('1'), card('2')], 'c1'));
    const feed = useFeedStore();

    await feed.abrir(API);

    expect(pedido(0)).toMatchObject({ categoria: null, status: null, cursor: null });
    expect(feed.itens.map((item) => item.id)).toEqual(['1', '2']);
    expect(feed.temMais).toBe(true);
    expect(feed.vazio).toBe(false);
  });

  it('filtra pelo município da configuração pública', async () => {
    useConfigStore().config = { municipio: { id: 3552205 } } as ConfigPublica;
    buscar.mockResolvedValueOnce(pagina([]));

    await useFeedStore().abrir(API);

    expect(pedido(0).municipio).toBe(3552205);
  });

  it('categoria e status combinam e recomeçam a lista do início', async () => {
    buscar.mockResolvedValueOnce(pagina([card('1'), card('2')], 'c1'));
    const feed = useFeedStore();
    await feed.abrir(API);

    const resolvida = card('9', { status_publico: 'RESOLVIDO' });
    buscar.mockResolvedValueOnce(pagina([resolvida]));
    await feed.filtrar(API, { categoria: 'iluminacao' });
    buscar.mockResolvedValueOnce(pagina([resolvida]));
    await feed.filtrar(API, { status: 'RESOLVIDO' });

    expect(pedido(1)).toMatchObject({ categoria: 'iluminacao', status: null, cursor: null });
    expect(pedido(2)).toMatchObject({ categoria: 'iluminacao', status: 'RESOLVIDO', cursor: null });
    expect(feed.itens).toEqual([resolvida]);
    expect(feed.comFiltro).toBe(true);
    expect(feed.temMais).toBe(false);
  });

  it('chegar ao fim pede a página seguinte com o cursor e junta os itens', async () => {
    buscar.mockResolvedValueOnce(pagina([card('1'), card('2')], 'c1'));
    const feed = useFeedStore();
    await feed.filtrar(API, { categoria: 'iluminacao', status: 'RESOLVIDO' });

    buscar.mockResolvedValueOnce(pagina([card('3')]));
    await feed.carregarMais(API);

    expect(pedido(1)).toMatchObject({
      categoria: 'iluminacao',
      status: 'RESOLVIDO',
      cursor: 'c1',
    });
    expect(feed.itens.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(feed.temMais).toBe(false);

    await feed.carregarMais(API);
    expect(buscar).toHaveBeenCalledTimes(2);
  });

  it('não pede a mesma página duas vezes enquanto ela não chega', async () => {
    buscar.mockResolvedValueOnce(pagina([card('1')], 'c1'));
    const feed = useFeedStore();
    await feed.abrir(API);

    const resposta = adiada();
    buscar.mockReturnValueOnce(resposta.promessa);
    const primeira = feed.carregarMais(API);
    await feed.carregarMais(API);
    resposta.entregar(pagina([card('2')]));
    await primeira;

    expect(buscar).toHaveBeenCalledTimes(2);
    expect(feed.itens.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('a resposta de um filtro antigo que chega depois é descartada', async () => {
    const feed = useFeedStore();
    const antiga = adiada();
    buscar.mockReturnValueOnce(antiga.promessa);
    const primeira = feed.filtrar(API, { categoria: 'pavimentacao' });

    buscar.mockResolvedValueOnce(pagina([card('ilu')]));
    await feed.filtrar(API, { categoria: 'iluminacao' });
    antiga.entregar(pagina([card('pav')]));
    await primeira;

    expect(feed.itens.map((item) => item.id)).toEqual(['ilu']);
    expect(feed.carregando).toBe(false);
  });

  it('um filtro sem resultados fica vazio, e limpar os filtros volta a mostrar tudo', async () => {
    buscar.mockResolvedValueOnce(pagina([]));
    const feed = useFeedStore();
    await feed.filtrar(API, { categoria: 'limpeza', status: 'RESOLVIDO' });

    expect(feed.vazio).toBe(true);
    expect(feed.comFiltro).toBe(true);

    buscar.mockResolvedValueOnce(pagina([card('1')]));
    await feed.limparFiltros(API);

    expect(pedido(1)).toMatchObject({ categoria: null, status: null });
    expect(feed.comFiltro).toBe(false);
    expect(feed.vazio).toBe(false);
  });

  it('um erro mostra a mensagem e "Tentar de novo" repete a página que falhou', async () => {
    buscar.mockResolvedValueOnce(pagina([card('1')], 'c1'));
    const feed = useFeedStore();
    await feed.abrir(API);

    buscar.mockResolvedValueOnce({ tipo: 'ERRO', mensagem: 'Sem conexão.' });
    await feed.carregarMais(API);
    expect(feed.erro).toBe('Sem conexão.');
    expect(feed.vazio).toBe(false);
    expect(feed.itens).toHaveLength(1);

    buscar.mockResolvedValueOnce(pagina([card('2')]));
    await feed.tentarDeNovo(API);

    expect(pedido(2).cursor).toBe('c1');
    expect(feed.erro).toBeNull();
    expect(feed.itens.map((item) => item.id)).toEqual(['1', '2']);
  });

  it('voltar ao feed logo depois mantém a lista; depois de um minuto, busca de novo', async () => {
    vi.useFakeTimers();
    buscar.mockResolvedValue(pagina([card('1')], 'c1'));
    const feed = useFeedStore();
    await feed.abrir(API);

    vi.advanceTimersByTime(VALIDADE_FEED_MS - 1000);
    await feed.abrir(API);
    expect(buscar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    await feed.abrir(API);
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});
