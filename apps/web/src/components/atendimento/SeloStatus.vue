<script setup lang="ts">
import { ROTULO_STATUS, type StatusInterno, tomDoStatus } from '@/services/atendimento';

defineProps<{ status: StatusInterno }>();
</script>

<template>
  <span class="selo" :class="`selo--${tomDoStatus(status)}`">{{ ROTULO_STATUS[status] }}</span>
</template>

<style scoped lang="scss">
.selo {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;

  &--recebido {
    background: var(--fa-recebido-fundo);
    color: var(--fa-recebido-texto);
  }

  &--andamento {
    background: var(--fa-andamento-fundo);
    color: var(--fa-andamento-texto);
  }

  &--resolvido {
    background: var(--fa-resolvido-fundo);
    color: var(--fa-resolvido-texto);
  }

  &--final {
    background: var(--fa-superficie-2);
    color: var(--fa-texto-2);
  }
}
</style>
