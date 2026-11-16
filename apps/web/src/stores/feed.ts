import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Api } from '@/services/api';
import {
  buscarPagina,
  type CardOcorrencia,
  FILTROS_VAZIOS,
  type FiltrosFeed,
} from '@/services/feed';
import { useConfigStore } from '@/stores/config';

/** Voltar ao feed depois disso busca a lista de novo; antes, mantém onde a pessoa estava. */
export const VALIDADE_FEED_MS = 60_000;

/**
 * O feed da tela inicial. Fica na store: voltar do detalhe de uma ocorrência mantém a lista
 * e os filtros.
 */
export const useFeedStore = defineStore('feed', () => {
  const itens = ref<CardOcorrencia[]>([]);
  const filtros = ref<FiltrosFeed>({ ...FILTROS_VAZIOS });
  const proximoCursor = ref<string | null>(null);
  /** A primeira página dos filtros atuais já chegou. */
  const carregado = ref(false);
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  let carregadoEm = 0;

  /**
   * Cada troca de filtro abre uma nova consulta; a resposta de uma consulta antiga, que chega
   * depois, é descartada.
   */
  let consulta = 0;

  const comFiltro = computed(
    () => filtros.value.categoria !== null || filtros.value.status !== null,
  );
  const temMais = computed(() => carregado.value && proximoCursor.value !== null);
  const vazio = computed(() => carregado.value && !erro.value && itens.value.length === 0);

  async function pedirPagina(api: Api, cursor: string | null): Promise<void> {
    const minha = consulta;
    carregando.value = true;
    erro.value = null;
    const resultado = await buscarPagina(api, {
      ...filtros.value,
      municipio: useConfigStore().municipio?.id,
      cursor,
    });
    if (minha !== consulta) return;

    carregando.value = false;
    if (resultado.tipo === 'ERRO') {
      erro.value = resultado.mensagem;
      return;
    }
    itens.value = cursor ? [...itens.value, ...resultado.itens] : resultado.itens;
    proximoCursor.value = resultado.proximoCursor;
    carregado.value = true;
    if (!cursor) carregadoEm = Date.now();
  }

  /** Recomeça do início, com os filtros atuais. */
  function recarregar(api: Api): Promise<void> {
    consulta += 1;
    itens.value = [];
    proximoCursor.value = null;
    carregado.value = false;
    return pedirPagina(api, null);
  }

  /** Ao abrir a tela: busca a primeira página se ainda não buscou ou se a lista ficou velha. */
  function abrir(api: Api): Promise<void> {
    const velho = Date.now() - carregadoEm > VALIDADE_FEED_MS;
    if (carregando.value || (carregado.value && !velho)) return Promise.resolve();
    return recarregar(api);
  }

  /** A página seguinte, ao chegar ao fim da lista. Não faz nada sem mais itens ou já buscando. */
  function carregarMais(api: Api): Promise<void> {
    if (carregando.value || !temMais.value) return Promise.resolve();
    return pedirPagina(api, proximoCursor.value);
  }

  /** Tenta de novo o que falhou: a primeira página ou a seguinte. */
  function tentarDeNovo(api: Api): Promise<void> {
    return carregado.value ? pedirPagina(api, proximoCursor.value) : recarregar(api);
  }

  function filtrar(api: Api, mudanca: Partial<FiltrosFeed>): Promise<void> {
    filtros.value = { ...filtros.value, ...mudanca };
    return recarregar(api);
  }

  function limparFiltros(api: Api): Promise<void> {
    return filtrar(api, FILTROS_VAZIOS);
  }

  return {
    itens,
    filtros,
    proximoCursor,
    carregado,
    carregando,
    erro,
    comFiltro,
    temMais,
    vazio,
    abrir,
    recarregar,
    carregarMais,
    tentarDeNovo,
    filtrar,
    limparFiltros,
  };
});
