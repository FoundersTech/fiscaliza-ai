<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';

import { useApi } from '@/boot/api';
import { formatarDias, formatarPercentual } from '@/services/painel';
import { formatarNotaScore, SEM_DADOS_SUFICIENTES } from '@/services/score';
import { useConfigStore } from '@/stores/config';
import { useScoreStore } from '@/stores/score';

const api = useApi();
const loja = useScoreStore();
const config = useConfigStore();

const dados = computed(() => loja.score);
const temNota = computed(() => dados.value?.score != null);

const nota = computed(() => formatarNotaScore(dados.value?.score ?? null));
const titulo = computed(() =>
  temNota.value ? (dados.value?.classificacao ?? '') : SEM_DADOS_SUFICIENTES,
);
const legenda = computed(() => {
  if (temNota.value && dados.value) {
    const resolvidas = `${formatarPercentual(dados.value.resolvidas_pct)} resolvidas`;
    return dados.value.dias_mediana === null
      ? resolvidas
      : `${resolvidas} · mediana ${formatarDias(dados.value.dias_mediana)}`;
  }
  if (loja.carregando) return 'Carregando a nota da gestão…';
  if (loja.erro) return 'Não foi possível carregar a nota agora.';
  return 'A nota aparece com as primeiras ocorrências.';
});
const rotuloAcessivel = computed(() =>
  temNota.value
    ? `Reputação da gestão: nota ${nota.value} de 10, ${titulo.value}. Ver detalhes`
    : 'Ver a reputação da gestão',
);

onMounted(async () => {
  await config.carregar(api);
  await loja.garantir(api);
});

// Trocar de cidade no cabeçalho traz a nota da nova.
watch(
  () => config.municipio?.id,
  (nova, antiga) => {
    if (antiga !== undefined && nova !== antiga) void loja.carregar(api);
  },
);
</script>

<template>
  <router-link
    to="/score"
    class="selo fa-card"
    :aria-label="rotuloAcessivel"
    :aria-busy="loja.carregando"
  >
    <div class="selo__nota" aria-hidden="true">
      <span class="selo__valor">{{ nota }}</span>
      <span class="selo__escala">/10</span>
    </div>
    <div class="selo__texto">
      <span class="fa-sobrelinha">Reputação da gestão</span>
      <strong>{{ titulo }}</strong>
      <span class="fa-legenda">{{ legenda }}</span>
    </div>
    <q-icon name="sym_o_chevron_right" size="20px" class="selo__seta" />
  </router-link>
</template>

<style scoped lang="scss">
.selo {
  display: flex;
  align-items: center;
  gap: 16px;
  color: inherit;
  text-decoration: none;
}

.selo__nota {
  display: grid;
  place-items: center;
  align-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-azul-suave);
  color: var(--fa-azul);
}

.selo__valor {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.selo__escala {
  font-size: 10px;
}

.selo__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;

  strong {
    font-size: 16px;
    font-weight: 600;
  }
}

.selo__seta {
  color: var(--fa-texto-3);
}
</style>
