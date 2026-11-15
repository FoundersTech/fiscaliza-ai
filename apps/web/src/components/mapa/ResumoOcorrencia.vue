<script setup lang="ts">
import type { ResumoPonto } from '@/services/mapa-ocorrencias';

defineProps<{ resumo: ResumoPonto }>();
defineEmits<{ fechar: [] }>();
</script>

<template>
  <section class="resumo" aria-label="Resumo da ocorrência">
    <div class="resumo__icone">
      <q-icon :name="resumo.icone" size="22px" />
    </div>
    <div class="resumo__texto">
      <h2 class="resumo__titulo">{{ resumo.titulo }}</h2>
      <div class="resumo__selos">
        <span class="resumo__status" :class="`resumo__status--${resumo.statusPublico}`">
          <span class="resumo__ponto" :style="{ background: resumo.status.cor }" />
          {{ resumo.status.rotulo }}
        </span>
        <span v-if="resumo.urgente" class="resumo__urgente">URGENTE</span>
      </div>
      <router-link :to="resumo.link" class="fa-link resumo__link">
        Ver detalhes
        <q-icon name="sym_o_arrow_forward" size="16px" />
      </router-link>
    </div>
    <q-btn
      round
      flat
      dense
      icon="sym_o_close"
      aria-label="Fechar resumo"
      class="resumo__fechar"
      @click="$emit('fechar')"
    />
  </section>
</template>

<style scoped lang="scss">
.resumo {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--fa-superficie);
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-lg);
  box-shadow: var(--fa-sombra);
}

.resumo__icone {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: var(--fa-raio);
  background: var(--fa-superficie-2);
  color: var(--fa-texto-2);
}

.resumo__texto {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resumo__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.resumo__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.resumo__status,
.resumo__urgente {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
}

.resumo__status {
  &--RECEBIDO {
    background: var(--fa-recebido-fundo);
    color: var(--fa-recebido-texto);
  }

  &--EM_ANDAMENTO {
    background: var(--fa-andamento-fundo);
    color: var(--fa-andamento-texto);
  }

  &--RESOLVIDO {
    background: var(--fa-resolvido-fundo);
    color: var(--fa-resolvido-texto);
  }
}

.resumo__ponto {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.resumo__urgente {
  background: var(--fa-urgente);
  color: #ffffff;
  letter-spacing: 0.04em;
}

.resumo__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
}

.resumo__fechar {
  color: var(--fa-texto-3);
}
</style>
