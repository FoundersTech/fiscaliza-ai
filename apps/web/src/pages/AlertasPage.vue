<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import SeloStatus from '@/components/ocorrencia/SeloStatus.vue';
import { textoDoAlerta } from '@/services/alertas';
import { useAlertasStore } from '@/stores/alertas';
import { dataCurta } from '@/utils/status-ocorrencia';

const api = useApi();
const alertas = useAlertasStore();

onMounted(() => void alertas.abrirAba(api));
onUnmounted(() => alertas.sairDaAba());

// Com a aba aberta, um alerta que chega na consulta de cada minuto entra na lista e já fica visto.
watch(
  () => alertas.novos,
  (quantidade) => {
    if (quantidade > 0) void alertas.abrirAba(api);
  },
);

function aoChegarNoFim(_indice: number, pronto: (parar?: boolean) => void): void {
  void alertas.carregarMais(api).then(() => pronto(!alertas.temMais));
}

function tentarDeNovo(): void {
  void (alertas.carregou ? alertas.carregarMais(api) : alertas.abrirAba(api));
}
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Alertas" :com-alertas="false" />

      <q-infinite-scroll
        v-if="alertas.itens.length > 0"
        :offset="300"
        :disable="!alertas.temMais"
        @load="aoChegarNoFim"
      >
        <ul class="lista" aria-label="Alertas">
          <li v-for="(alerta, indice) in alertas.itens" :key="alerta.evento_id">
            <router-link
              :to="`/ocorrencias/${alerta.ocorrencia_id}`"
              class="alerta fa-card"
              :class="{ 'alerta--novo': indice < alertas.destacados }"
              data-teste="alerta"
            >
              <q-icon
                :name="alerta.reaberta ? 'sym_o_replay' : 'sym_o_notifications'"
                size="24px"
                class="alerta__icone"
              />
              <div class="alerta__corpo">
                <div class="alerta__topo">
                  <SeloStatus :status="alerta.para_status_publico" />
                  <span v-if="indice < alertas.destacados" class="alerta__novo">Novo</span>
                </div>
                <strong>Ocorrência {{ alerta.protocolo }}</strong>
                <span class="alerta__texto">{{ textoDoAlerta(alerta) }}</span>
                <span class="fa-legenda">{{ dataCurta(alerta.criado_em) }}</span>
              </div>
              <q-icon name="sym_o_chevron_right" size="20px" class="alerta__seta" />
            </router-link>
          </li>
        </ul>
        <template #loading>
          <div class="carregando"><q-spinner size="24px" /></div>
        </template>
      </q-infinite-scroll>

      <div v-if="alertas.carregando && !alertas.carregou" class="carregando">
        <q-spinner size="32px" />
      </div>

      <div v-if="alertas.erro" class="erro">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ alertas.erro }}</p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="tentarDeNovo" />
      </div>

      <EstadoVazio
        v-if="alertas.carregou && alertas.itens.length === 0"
        icone="sym_o_notifications"
        titulo="Nenhum alerta"
        texto="Quando uma ocorrência que você registrou ou confirmou mudar de status, o aviso aparece aqui."
      />
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.lista {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.alerta {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: inherit;
  text-decoration: none;

  &--novo {
    border-color: var(--fa-azul);
  }
}

.alerta__icone {
  color: var(--fa-azul);
  flex-shrink: 0;
}

.alerta__corpo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.alerta__topo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alerta__novo {
  font-size: 11px;
  font-weight: 600;
  color: var(--fa-azul);
  text-transform: uppercase;
}

.alerta__texto {
  color: var(--fa-texto-2);
}

.alerta__seta {
  color: var(--fa-texto-3);
  align-self: center;
}

.carregando {
  display: flex;
  justify-content: center;
  padding: var(--fa-pagina);
  color: var(--fa-azul);
}

.erro {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;

  p {
    margin: 0;
  }
}
</style>
