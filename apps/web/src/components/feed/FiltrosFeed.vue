<script setup lang="ts">
import { type FiltrosFeed, STATUS_PUBLICOS } from '@/services/feed';

defineProps<{
  filtros: FiltrosFeed;
  categorias: { slug: string; nome: string }[];
}>();

const emit = defineEmits<{ filtrar: [mudanca: Partial<FiltrosFeed>] }>();
</script>

<template>
  <div class="filtros">
    <div class="filtros__linha" role="group" aria-label="Filtrar por categoria">
      <button
        type="button"
        class="chip"
        :aria-pressed="filtros.categoria === null"
        @click="emit('filtrar', { categoria: null })"
      >
        Todos
      </button>
      <button
        v-for="categoria in categorias"
        :key="categoria.slug"
        type="button"
        class="chip"
        :aria-pressed="filtros.categoria === categoria.slug"
        @click="emit('filtrar', { categoria: categoria.slug })"
      >
        {{ categoria.nome }}
      </button>
    </div>

    <div class="filtros__linha" role="group" aria-label="Filtrar por status">
      <button
        type="button"
        class="chip chip--pequeno"
        :aria-pressed="filtros.status === null"
        @click="emit('filtrar', { status: null })"
      >
        Todos os status
      </button>
      <button
        v-for="status in STATUS_PUBLICOS"
        :key="status.valor"
        type="button"
        class="chip chip--pequeno"
        :aria-pressed="filtros.status === status.valor"
        @click="emit('filtrar', { status: status.valor })"
      >
        {{ status.rotulo }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.filtros {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// Rola na horizontal até a borda da tela, como no celular.
.filtros__linha {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 calc(var(--fa-pagina) * -1);
  padding: 2px var(--fa-pagina);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex-shrink: 0;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie);
  color: var(--fa-texto-2);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;

  &[aria-pressed='true'] {
    background: var(--fa-azul);
    border-color: var(--fa-azul);
    color: #fff;
  }

  &--pequeno {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
}
</style>
