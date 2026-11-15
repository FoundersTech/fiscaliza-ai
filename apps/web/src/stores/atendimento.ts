import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { Api } from '@/services/api';
import {
  AVISO_CONFLITO,
  type DetalheAtendimento,
  type FiltrosFila,
  type ItemFila,
  listarFila,
  obterDetalhe,
  type ResultadoTransicao,
  STATUS_ABERTOS,
  type StatusInterno,
  transicionar,
} from '@/services/atendimento';

/** Fila e detalhe do atendimento. Os filtros ficam na store: voltar do detalhe não os perde. */
export const useAtendimentoStore = defineStore('atendimento', () => {
  const filtros = ref<FiltrosFila>({ status: [...STATUS_ABERTOS], categorias: [] });
  const itens = ref<ItemFila[]>([]);
  const proximoCursor = ref<string | null>(null);
  const carregandoFila = ref(false);
  const erroFila = ref<string | null>(null);
  /** Uma resposta que chega depois de o filtro mudar é descartada. */
  let consultaAtual = 0;

  const detalhe = ref<DetalheAtendimento | null>(null);
  const carregandoDetalhe = ref(false);
  const erroDetalhe = ref<string | null>(null);
  const executando = ref(false);
  /** Aviso de que a ocorrência mudou em outro lugar e a tela foi recarregada. */
  const aviso = ref<string | null>(null);
  let detalheAtual: string | null = null;

  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor];
  }

  function alternarStatus(status: StatusInterno): void {
    filtros.value = { ...filtros.value, status: alternar(filtros.value.status, status) };
  }

  function alternarCategoria(slug: string): void {
    filtros.value = { ...filtros.value, categorias: alternar(filtros.value.categorias, slug) };
  }

  async function buscarPagina(api: Api, cursor: string | null): Promise<void> {
    const consulta = ++consultaAtual;
    carregandoFila.value = true;
    erroFila.value = null;
    const resultado = await listarFila(api, filtros.value, cursor);
    if (consulta !== consultaAtual) return;
    carregandoFila.value = false;
    if (resultado.tipo === 'ERRO') {
      erroFila.value = resultado.mensagem;
      return;
    }
    itens.value = cursor ? [...itens.value, ...resultado.itens] : resultado.itens;
    proximoCursor.value = resultado.proximoCursor;
  }

  /** Recomeça da primeira página, com os filtros atuais. */
  function carregarFila(api: Api): Promise<void> {
    proximoCursor.value = null;
    return buscarPagina(api, null);
  }

  function carregarMais(api: Api): Promise<void> {
    if (!proximoCursor.value || carregandoFila.value) return Promise.resolve();
    return buscarPagina(api, proximoCursor.value);
  }

  async function recarregarDetalhe(api: Api, id: string): Promise<void> {
    carregandoDetalhe.value = true;
    erroDetalhe.value = null;
    const resultado = await obterDetalhe(api, id);
    if (id !== detalheAtual) return;
    carregandoDetalhe.value = false;
    if (resultado.tipo === 'ERRO') {
      erroDetalhe.value = resultado.mensagem;
      return;
    }
    detalhe.value = resultado.detalhe;
  }

  function abrirDetalhe(api: Api, id: string): Promise<void> {
    if (detalheAtual !== id) {
      detalhe.value = null;
      aviso.value = null;
    }
    detalheAtual = id;
    return recarregarDetalhe(api, id);
  }

  /**
   * Muda o status a partir do que a tela mostra. Se outra pessoa (ou outra aba) mudou antes, a API
   * recusa e a tela recarrega com o status novo, para o agente decidir de novo.
   */
  async function executar(
    api: Api,
    para: StatusInterno,
    valor?: string,
  ): Promise<ResultadoTransicao | null> {
    const atual = detalhe.value;
    if (!atual || executando.value) return null;
    executando.value = true;
    aviso.value = null;
    try {
      const resultado = await transicionar(api, atual.id, {
        de: atual.status,
        para,
        ...(valor === undefined ? {} : { valor }),
      });
      if (resultado.tipo === 'CONFLITO') aviso.value = AVISO_CONFLITO;
      if (resultado.tipo !== 'ERRO') await recarregarDetalhe(api, atual.id);
      return resultado;
    } finally {
      executando.value = false;
    }
  }

  return {
    filtros,
    itens,
    proximoCursor,
    carregandoFila,
    erroFila,
    alternarStatus,
    alternarCategoria,
    carregarFila,
    carregarMais,
    detalhe,
    carregandoDetalhe,
    erroDetalhe,
    executando,
    aviso,
    abrirDetalhe,
    executar,
  };
});
