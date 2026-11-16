import { defineStore } from 'pinia';
import { ref } from 'vue';

import type { Api } from '@/services/api';
import { buscarScore, type Score } from '@/services/score';
import { useConfigStore } from '@/stores/config';

/** Reputação da gestão da cidade escolhida, compartilhada entre o selo do feed e a tela de Score. */
export const useScoreStore = defineStore('score', () => {
  const score = ref<Score | null>(null);
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  /** De qual cidade é a nota guardada: trocar de cidade pede a nota da nova. */
  let municipioDaNota: number | undefined;

  // Só a resposta do pedido mais recente vale: um "tentar de novo" no meio de outro pedido
  // não deixa a resposta antiga sobrescrever a nova.
  let ultimoPedido = 0;

  /** Busca de novo, mesmo com a nota já carregada. */
  async function carregar(api: Api): Promise<void> {
    const pedido = ++ultimoPedido;
    carregando.value = true;
    erro.value = null;
    const municipio = useConfigStore().municipio?.id;
    const resultado = await buscarScore(api, municipio);
    if (pedido !== ultimoPedido) return;

    carregando.value = false;
    if (resultado.ok) {
      score.value = resultado.score;
      municipioDaNota = municipio;
    } else {
      score.value = null;
      erro.value = resultado.mensagem;
    }
  }

  /** Busca só se ainda não há nota da cidade nem pedido em andamento: o feed e a tela usam a mesma. */
  function garantir(api: Api): Promise<void> {
    const daCidade = score.value !== null && municipioDaNota === useConfigStore().municipio?.id;
    if (daCidade || carregando.value) return Promise.resolve();
    return carregar(api);
  }

  return { score, carregando, erro, carregar, garantir };
});
