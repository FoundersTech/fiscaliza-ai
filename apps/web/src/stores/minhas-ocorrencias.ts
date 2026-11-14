import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import type { Api } from '@/services/api';
import { buscarMinhas, type MinhaOcorrencia } from '@/services/ocorrencia';
import { useAuthStore } from '@/stores/auth';

/**
 * As ocorrências do usuário que já estão no servidor, com todos os status (recusadas e duplicadas
 * também), página a página pelo cursor da API.
 */
export const useMinhasOcorrenciasStore = defineStore('minhas-ocorrencias', () => {
  const auth = useAuthStore();

  const itens = shallowRef<MinhaOcorrencia[]>([]);
  const proximoCursor = ref<string | null>(null);
  const carregando = ref(false);
  const carregou = ref(false);
  const erro = ref<string | null>(null);
  /** De quem é a lista em memória: trocar de conta não mostra as do usuário anterior. */
  let dono: string | null = null;
  /** Cada recomeço invalida as respostas que ainda estavam a caminho. */
  let geracao = 0;

  const temMais = computed(() => carregou.value && proximoCursor.value !== null);

  async function buscar(api: Api, cursor: string | null): Promise<void> {
    const minha = geracao;
    carregando.value = true;
    erro.value = null;
    const resultado = await buscarMinhas(api, cursor);
    if (minha !== geracao) return;
    carregando.value = false;
    if (resultado.tipo === 'ERRO') {
      erro.value = resultado.mensagem;
      return;
    }
    // Uma página seguinte não repete o que já está na lista.
    const vistos = new Set(cursor ? itens.value.map((item) => item.id) : []);
    const novos = resultado.itens.filter((item) => !vistos.has(item.id));
    itens.value = cursor ? [...itens.value, ...novos] : novos;
    proximoCursor.value = resultado.proximoCursor;
    carregou.value = true;
  }

  /** Busca a primeira página de novo. A lista atual fica na tela até a resposta chegar. */
  function recarregar(api: Api): Promise<void> {
    const usuario = auth.usuario?.id ?? null;
    if (usuario !== dono) {
      dono = usuario;
      itens.value = [];
      proximoCursor.value = null;
      carregou.value = false;
    }
    geracao += 1;
    return buscar(api, null);
  }

  /** A página seguinte; não faz nada enquanto outra busca está em andamento ou no fim da lista. */
  function carregarMais(api: Api): Promise<void> {
    if (carregando.value || !temMais.value) return Promise.resolve();
    return buscar(api, proximoCursor.value);
  }

  return { itens, proximoCursor, carregando, carregou, erro, temMais, recarregar, carregarMais };
});
