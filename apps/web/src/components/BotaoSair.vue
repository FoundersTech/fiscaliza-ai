<script setup lang="ts">
import { computed, ref } from 'vue';

import { avisoDeSaida } from '@/services/sincronizacao';
import { usePendentesStore } from '@/stores/pendentes';

/** "Sair da conta". Com ocorrências não enviadas, avisa que elas serão descartadas. */
const emit = defineEmits<{ sair: [] }>();

const pendentes = usePendentesStore();
const confirmando = ref(false);
const aviso = computed(() => avisoDeSaida(pendentes.quantidade));

function pedir(): void {
  if (aviso.value) confirmando.value = true;
  else emit('sair');
}

async function sairDescartando(): Promise<void> {
  confirmando.value = false;
  await pendentes.descartarDoUsuario();
  emit('sair');
}
</script>

<template>
  <q-btn flat no-caps label="Sair da conta" class="fa-botao-largo" @click="pedir" />

  <q-dialog v-model="confirmando">
    <q-card class="sair">
      <q-card-section>
        <h2 class="fa-titulo">Sair da conta?</h2>
        <p role="alert">{{ aviso }}</p>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="Ficar" />
        <q-btn unelevated no-caps color="negative" label="Sair" @click="sairDescartando" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.sair {
  max-width: 360px;

  h2 {
    margin: 0 0 8px;
  }

  p {
    margin: 0;
    color: var(--fa-texto-2);
  }
}
</style>
