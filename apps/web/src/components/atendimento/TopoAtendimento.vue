<script setup lang="ts">
import { useTema } from '@/composables/useTema';

defineProps<{ titulo: string; subtitulo?: string; voltarPara: string; rotuloVoltar: string }>();

const { escuro, alternarTema } = useTema();
</script>

<template>
  <q-header class="topo">
    <div class="topo__linha">
      <q-btn round flat dense icon="sym_o_arrow_back" :to="voltarPara" :aria-label="rotuloVoltar" />
      <div class="topo__texto">
        <p v-if="subtitulo" class="topo__subtitulo">{{ subtitulo }}</p>
        <h1 class="topo__titulo">{{ titulo }}</h1>
      </div>
      <q-btn
        round
        flat
        class="fa-botao-redondo"
        :icon="escuro ? 'sym_o_light_mode' : 'sym_o_dark_mode'"
        :aria-label="escuro ? 'Usar tema claro' : 'Usar tema escuro'"
        @click="alternarTema"
      />
    </div>
  </q-header>
</template>

<style scoped lang="scss">
.topo {
  background: var(--fa-fundo);
  color: var(--fa-texto);
  border-bottom: 1px solid var(--fa-borda);
  padding: calc(env(safe-area-inset-top, 0px) + 12px) var(--fa-pagina) 12px;
}

.topo__linha {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 560px;
  margin: 0 auto;
}

.topo__texto {
  flex: 1;
  min-width: 0;
}

.topo__subtitulo {
  margin: 0;
  font-size: 12px;
  color: var(--fa-texto-3);
}

.topo__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
