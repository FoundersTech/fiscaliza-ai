<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useApi } from '@/boot/api';
import ModalDuplicidade from '@/components/registro/ModalDuplicidade.vue';
import PassoDescricao from '@/components/registro/PassoDescricao.vue';
import PassoFotos from '@/components/registro/PassoFotos.vue';
import PassoLocal from '@/components/registro/PassoLocal.vue';
import RegistroConcluido from '@/components/registro/RegistroConcluido.vue';
import type { Candidata } from '@/services/envio';
import { TOTAL_PASSOS } from '@/services/registro';
import { useRegistroStore } from '@/stores/registro';

const TITULOS = ['Foto do problema', 'Categoria e descrição', 'Localização'] as const;

const router = useRouter();
const api = useApi();
const registro = useRegistroStore();

const erroEnvio = ref<string | null>(null);
const candidatas = ref<Candidata[]>([]);
const duplicidadeAberta = ref(false);
const erroConfirmacao = ref<string | null>(null);

const titulo = computed(() => TITULOS[registro.passo - 1]);
const progresso = computed(() => `${(registro.passo / TOTAL_PASSOS) * 100}%`);

async function enviar(forcarCriacao = false): Promise<void> {
  erroEnvio.value = null;
  erroConfirmacao.value = null;
  const resultado = await registro.enviar(api, forcarCriacao);
  if (resultado.tipo === 'DUPLICATA') {
    candidatas.value = resultado.candidatas;
    duplicidadeAberta.value = true;
    return;
  }
  duplicidadeAberta.value = false;
  if (resultado.tipo === 'ERRO') erroEnvio.value = resultado.mensagem;
}

async function tambemVi(candidata: Candidata): Promise<void> {
  erroConfirmacao.value = null;
  const resultado = await registro.confirmar(api, candidata);
  if (resultado.tipo === 'ERRO') {
    erroConfirmacao.value = resultado.mensagem;
  } else {
    duplicidadeAberta.value = false;
  }
}

function aoContinuar(): void {
  if (registro.passo < TOTAL_PASSOS) {
    registro.avancar();
  } else {
    void enviar();
  }
}

function concluir(destino: 'inicio' | 'outra'): void {
  registro.limpar();
  if (destino === 'inicio') void router.push('/');
}

// Depois do protocolo, quem sai e volta começa um registro novo.
onBeforeUnmount(() => {
  if (registro.conclusao) registro.limpar();
});

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
    <q-page-container v-if="registro.conclusao">
      <q-page class="registro__pagina">
        <RegistroConcluido
          :conclusao="registro.conclusao"
          @inicio="concluir('inicio')"
          @outra="concluir('outra')"
        />
      </q-page>
    </q-page-container>

    <template v-else>
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
          <PassoLocal v-else />
        </q-page>
      </q-page-container>

      <q-footer class="registro__rodape">
        <p v-if="erroEnvio" class="fa-mensagem fa-mensagem--erro registro__erro" role="alert">
          {{ erroEnvio }}
        </p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          class="fa-botao-largo"
          :label="registro.passo < TOTAL_PASSOS ? 'Continuar' : 'Enviar notificação'"
          :disable="!registro.passoCompleto"
          :loading="registro.enviando"
          @click="aoContinuar"
        />
      </q-footer>

      <ModalDuplicidade
        v-model="duplicidadeAberta"
        :candidatas="candidatas"
        :enviando="registro.enviando"
        :erro="erroConfirmacao"
        @tambem-vi="tambemVi"
        @outro-problema="enviar(true)"
      />
    </template>
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

.registro__erro {
  max-width: 560px;
  margin: 0 auto 12px;
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
