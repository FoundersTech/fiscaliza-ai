<script setup lang="ts">
import { computed } from 'vue';

import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import { telasAdmin } from '@/services/administracao';
import { useAuthStore } from '@/stores/auth';

defineProps<{ titulo: string; subtitulo: string }>();

const auth = useAuthStore();
const telas = computed(() => telasAdmin(auth.papel));
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina :titulo="titulo" :subtitulo="subtitulo" :com-alertas="false" />
      <nav v-if="telas.length > 1" class="abas" aria-label="Telas de administração">
        <router-link
          v-for="tela in telas"
          :key="tela.rota"
          :to="tela.rota"
          class="abas__item"
          active-class="abas__item--ativa"
        >
          <q-icon :name="tela.icone" size="18px" />
          {{ tela.rotulo }}
        </router-link>
      </nav>
      <slot />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.abas {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.abas__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie);
  color: var(--fa-texto-2);
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;

  &--ativa {
    border-color: var(--fa-azul);
    background: var(--fa-azul-suave);
    color: var(--fa-azul);
  }
}
</style>
