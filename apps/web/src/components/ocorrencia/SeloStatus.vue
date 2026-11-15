<script setup lang="ts">
import {
  classeDoStatus,
  rotuloDoStatusVisivel,
  type StatusVisivel,
} from '@/utils/status-ocorrencia';

defineProps<{ status: StatusVisivel }>();
</script>

<template>
  <span class="selo" :class="classeDoStatus(status)">{{ rotuloDoStatusVisivel(status) }}</span>
</template>

<style scoped lang="scss">
.selo {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  white-space: nowrap;
}

.status--recebido {
  background: var(--fa-recebido-fundo);
  color: var(--fa-recebido-texto);
}

.status--em-andamento {
  background: var(--fa-andamento-fundo);
  color: var(--fa-andamento-texto);
}

.status--resolvido {
  background: var(--fa-resolvido-fundo);
  color: var(--fa-resolvido-texto);
}

.status--recusado,
.status--duplicado {
  background: var(--fa-superficie-2);
  color: var(--fa-texto-2);
}
</style>
