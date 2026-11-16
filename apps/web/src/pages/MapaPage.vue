<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import MapaOcorrencias from '@/components/mapa/MapaOcorrencias.vue';
import { useConfigStore } from '@/stores/config';

const api = useApi();
const config = useConfigStore();
const semConfig = ref(false);

async function carregarConfig(): Promise<void> {
  semConfig.value = !(await config.carregar(api));
}

/** O mapa ocupa a altura que sobra entre o topo da tela e a barra inferior. */
function alturaDaPagina(deslocamento: number, altura: number) {
  return { height: `${altura - deslocamento}px` };
}

onMounted(carregarConfig);
</script>

<template>
  <q-page class="pagina-mapa" :style-fn="alturaDaPagina">
    <div class="pagina-mapa__cabecalho">
      <CabecalhoPagina titulo="Mapa" com-local />
    </div>

    <MapaOcorrencias
      v-if="config.config && config.municipio"
      :key="config.municipio.id"
      :map-id="config.config.google_maps_map_id"
      :municipio="config.municipio"
      :categorias="config.config.categorias_ativas"
    />
    <div v-else class="pagina-mapa__espera" role="status">
      <template v-if="semConfig">
        <q-icon name="sym_o_map" size="32px" />
        <span class="pagina-mapa__titulo">Mapa indisponível</span>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregarConfig" />
      </template>
      <q-spinner v-else size="28px" color="primary" />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.pagina-mapa {
  display: flex;
  flex-direction: column;
}

.pagina-mapa__cabecalho {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 0 var(--fa-pagina);
}

.pagina-mapa__espera {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--fa-texto-2);
}

.pagina-mapa__titulo {
  font-size: 16px;
  font-weight: 600;
}
</style>
