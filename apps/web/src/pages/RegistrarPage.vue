<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import EstadoVazio from '@/components/EstadoVazio.vue';
import PassoDescricao from '@/components/registro/PassoDescricao.vue';
import PassoFotos from '@/components/registro/PassoFotos.vue';
import { TOTAL_PASSOS } from '@/services/registro';
import { useRegistroStore } from '@/stores/registro';

const TITULOS = ['Foto do problema', 'Categoria e descrição', 'Localização'] as const;

const router = useRouter();
const registro = useRegistroStore();

const titulo = computed(() => TITULOS[registro.passo - 1]);
const progresso = computed(() => `${(registro.passo / TOTAL_PASSOS) * 100}%`);

/** No primeiro passo, a seta sai do registro; o que foi preenchido continua na store. */
function voltar(): void {
  if (registro.passo > 1) {
    registro.voltar();
  } else if (window.history.state?.back) {
    router.back();
  } else {
    void router.push('/');
  }
}
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="registro__topo">
      <div class="registro__cabecalho">
        <q-btn
          round
          flat
          dense
          icon="sym_o_arrow_back"
          :aria-label="registro.passo > 1 ? 'Voltar ao passo anterior' : 'Sair do registro'"
          @click="voltar"
        />
        <div>
          <p class="registro__passo">Passo {{ registro.passo }} de {{ TOTAL_PASSOS }}</p>
          <h1 class="registro__titulo">{{ titulo }}</h1>
        </div>
      </div>
      <div
        class="registro__progresso"
        role="progressbar"
        :aria-valuenow="registro.passo"
        aria-valuemin="1"
        :aria-valuemax="TOTAL_PASSOS"
      >
        <span :style="{ width: progresso }" />
      </div>
    </q-header>

    <q-page-container>
      <q-page class="registro__pagina">
        <PassoFotos v-if="registro.passo === 1" />
        <PassoDescricao v-else-if="registro.passo === 2" />
        <EstadoVazio
          v-else
          icone="sym_o_location_on"
          titulo="Localização"
          texto="Em breve: o mapa para confirmar o ponto do problema e enviar a notificação."
        />
      </q-page>
    </q-page-container>

    <q-footer class="registro__rodape">
      <q-btn
        unelevated
        no-caps
        color="primary"
        class="fa-botao-largo"
        :label="registro.passo < TOTAL_PASSOS ? 'Continuar' : 'Enviar notificação'"
        :disable="!registro.passoCompleto"
        @click="registro.avancar"
      />
    </q-footer>
  </q-layout>
</template>

<style scoped lang="scss">
.registro__topo {
  background: var(--fa-fundo);
  color: var(--fa-texto);
  padding: calc(env(safe-area-inset-top, 0px) + 12px) var(--fa-pagina) 0;
}

.registro__cabecalho,
.registro__progresso,
.registro__pagina,
.registro__rodape .fa-botao-largo {
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
}

.registro__cabecalho {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
}

.registro__passo {
  margin: 0;
  font-size: 12px;
  color: var(--fa-texto-3);
}

.registro__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}

.registro__progresso {
  height: 3px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-borda);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    background: var(--fa-azul);
    transition: width 0.2s ease;
  }
}

.registro__pagina {
  padding: 20px var(--fa-pagina) var(--fa-secao);
}

.registro__rodape {
  background: var(--fa-superficie);
  border-top: 1px solid var(--fa-borda);
  padding: 12px var(--fa-pagina) calc(env(safe-area-inset-bottom, 0px) + 12px);

  .fa-botao-largo {
    display: flex;
  }

  // Desabilitado em cinza, como no protótipo: só a opacidade do Quasar quase não muda no escuro.
  .fa-botao-largo.disabled {
    opacity: 1 !important;
    background: var(--fa-borda-forte) !important;
    color: var(--fa-texto-3) !important;
  }
}
</style>
