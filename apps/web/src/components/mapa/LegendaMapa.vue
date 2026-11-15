<script setup lang="ts">
import { LEGENDA } from '@/services/mapa-ocorrencias';
</script>

<template>
  <ul class="legenda" aria-label="Legenda das cores">
    <li v-for="item in LEGENDA" :key="item.status" class="legenda__item">
      <span class="legenda__cor" :style="{ background: item.cor, borderColor: item.borda }" />
      {{ item.rotulo }}
    </li>
  </ul>
</template>

<style scoped lang="scss">
.legenda {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 8px 12px;
  list-style: none;
  background: var(--fa-superficie);
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio);
  box-shadow: var(--fa-sombra);
  font-size: 12px;
  font-weight: 500;
  color: var(--fa-texto-2);
}

.legenda__item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legenda__cor {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid;
}
</style>
