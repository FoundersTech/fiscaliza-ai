<script setup lang="ts">
import { computed } from 'vue';

import { type CardOcorrencia, rotuloDoStatus, textoDosDias } from '@/services/feed';

const props = defineProps<{ ocorrencia: CardOcorrencia }>();

const classeStatus = computed(
  () => `status--${props.ocorrencia.status_publico.toLowerCase().replace('_', '-')}`,
);
</script>

<template>
  <router-link :to="`/ocorrencias/${ocorrencia.id}`" class="card">
    <div class="card__foto">
      <img
        v-if="ocorrencia.miniatura_url"
        :src="ocorrencia.miniatura_url"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span v-else class="card__sem-foto">
        <q-icon name="sym_o_image" size="16px" />
        {{ ocorrencia.foto_em_analise ? 'Foto em análise' : 'Sem foto' }}
      </span>

      <span v-if="ocorrencia.urgente" class="card__urgente">Urgente</span>
      <span class="card__status" :class="classeStatus">
        {{ rotuloDoStatus(ocorrencia.status_publico) }}
      </span>
    </div>

    <div class="card__corpo">
      <span class="fa-sobrelinha">{{ ocorrencia.categoria.nome }}</span>
      <p class="card__resumo">{{ ocorrencia.resumo }}</p>
      <p class="card__endereco">
        <q-icon name="sym_o_location_on" size="16px" />
        <span>{{ ocorrencia.endereco ?? 'Endereço será preenchido depois' }}</span>
      </p>

      <div class="card__rodape">
        <span class="card__confirmacoes">
          <q-icon name="sym_o_back_hand" size="16px" />
          <strong>{{ ocorrencia.confirmacoes }}</strong>
          · também vi
        </span>
        <span class="fa-legenda">
          {{ textoDosDias(ocorrencia.dias_em_aberto, ocorrencia.status_publico) }}
        </span>
      </div>
    </div>
  </router-link>
</template>

<style scoped lang="scss">
.card {
  display: block;
  overflow: hidden;
  background: var(--fa-superficie);
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-lg);
  box-shadow: var(--fa-sombra);
  color: inherit;
  text-decoration: none;
}

.card__foto {
  position: relative;
  aspect-ratio: 16 / 9;
  background: repeating-linear-gradient(
    135deg,
    var(--fa-superficie-2) 0 12px,
    color-mix(in srgb, var(--fa-superficie-2) 50%, var(--fa-superficie)) 12px 24px
  );

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.card__sem-foto {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-superficie);
  color: var(--fa-texto-3);
  font-size: 12px;
}

.card__urgente,
.card__status {
  position: absolute;
  top: 12px;
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
}

.card__urgente {
  left: 12px;
  background: var(--fa-urgente);
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

// Os fundos de status são translúcidos no tema escuro: a superfície por baixo
// mantém o selo legível sobre a foto.
.card__status {
  right: 12px;
  background-color: var(--fa-superficie);
}

.status--recebido {
  background-image: linear-gradient(var(--fa-recebido-fundo), var(--fa-recebido-fundo));
  color: var(--fa-recebido-texto);
}

.status--em-andamento {
  background-image: linear-gradient(var(--fa-andamento-fundo), var(--fa-andamento-fundo));
  color: var(--fa-andamento-texto);
}

.status--resolvido {
  background-image: linear-gradient(var(--fa-resolvido-fundo), var(--fa-resolvido-fundo));
  color: var(--fa-resolvido-texto);
}

.card__corpo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px var(--fa-card) var(--fa-pagina);
}

.card__resumo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card__endereco {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  color: var(--fa-texto-2);
  font-size: 13px;

  .q-icon {
    margin-top: 2px;
    flex-shrink: 0;
  }
}

.card__rodape {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--fa-borda);
}

.card__confirmacoes {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie-2);
  color: var(--fa-texto-2);
  font-size: 13px;
  font-weight: 500;

  strong {
    color: var(--fa-texto);
  }
}
</style>
