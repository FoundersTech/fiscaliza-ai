<script setup lang="ts">
import { computed } from 'vue';

import SeloStatus from '@/components/ocorrencia/SeloStatus.vue';
import type { MinhaOcorrencia } from '@/services/ocorrencia';
import { textoDosDiasVisivel } from '@/utils/status-ocorrencia';

const props = defineProps<{ ocorrencia: MinhaOcorrencia }>();

const dias = computed(() =>
  textoDosDiasVisivel(props.ocorrencia.dias_em_aberto, props.ocorrencia.status_publico),
);
</script>

<template>
  <article class="minha fa-card" :data-status="ocorrencia.status_publico">
    <router-link :to="`/ocorrencias/${ocorrencia.id}`" class="minha__link">
      <img
        v-if="ocorrencia.miniatura_url"
        :src="ocorrencia.miniatura_url"
        alt=""
        class="minha__foto"
        loading="lazy"
      />
      <div class="minha__corpo">
        <div class="minha__topo">
          <SeloStatus :status="ocorrencia.status_publico" />
          <span v-if="ocorrencia.urgente" class="minha__urgente">Urgente</span>
        </div>
        <strong class="minha__categoria">{{ ocorrencia.categoria.nome }}</strong>
        <p class="minha__resumo">{{ ocorrencia.resumo }}</p>
        <span class="fa-legenda">
          Protocolo <strong>{{ ocorrencia.protocolo }}</strong>
          <template v-if="dias"> · {{ dias }}</template>
        </span>
      </div>
    </router-link>

    <div
      v-if="ocorrencia.status_publico === 'RECUSADO'"
      class="minha__aviso"
      data-teste="justificativa"
    >
      <span class="fa-sobrelinha">Motivo da recusa</span>
      <p>{{ ocorrencia.justificativa_recusa ?? 'A prefeitura não informou o motivo.' }}</p>
    </div>

    <div v-if="ocorrencia.status_publico === 'DUPLICADO'" class="minha__aviso">
      <span class="fa-sobrelinha">Já havia um registro deste problema</span>
      <router-link
        v-if="ocorrencia.original"
        :to="`/ocorrencias/${ocorrencia.original.id}`"
        class="fa-link"
        data-teste="original"
      >
        Acompanhar a ocorrência {{ ocorrencia.original.protocolo }}
      </router-link>
    </div>
  </article>
</template>

<style scoped lang="scss">
.minha {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.minha__link {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: inherit;
  text-decoration: none;
}

.minha__foto {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--fa-raio-sm);
}

.minha__corpo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.minha__topo {
  display: flex;
  gap: 8px;
  align-items: center;
}

.minha__urgente {
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-urgente);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.minha__categoria {
  font-size: 15px;
  font-weight: 600;
}

.minha__resumo {
  margin: 0;
  color: var(--fa-texto-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.minha__aviso {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-superficie-2);

  p {
    margin: 0;
    color: var(--fa-texto-2);
    white-space: pre-line;
  }
}
</style>
