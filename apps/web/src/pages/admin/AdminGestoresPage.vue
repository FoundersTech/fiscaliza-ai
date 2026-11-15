<script setup lang="ts">
import type { QForm } from 'quasar';
import { computed, onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import CamposConvite from '@/components/admin/CamposConvite.vue';
import PaginaAdmin from '@/components/admin/PaginaAdmin.vue';
import { convidarGestor, type Gestor } from '@/services/administracao';
import { useConfigStore } from '@/stores/config';

const api = useApi();
const config = useConfigStore();

const formulario = ref<QForm | null>(null);
const nome = ref('');
const email = ref('');
const municipioId = ref<number | null>(null);
const enviando = ref(false);
const erro = ref<string | null>(null);
const erros = ref<Record<string, string>>({});
const convidado = ref<Gestor | null>(null);

/** No piloto há um município só: ele vem preenchido, pelo /config/publica. */
const municipio = computed(() => config.config?.municipio ?? null);

onMounted(async () => {
  await config.carregar(api);
  municipioId.value ??= municipio.value?.id ?? null;
});

const regraMunicipio = (valor: number | string | null) =>
  (valor !== null && valor !== '' && Number.isInteger(Number(valor))) ||
  'Informe o código IBGE do município';

async function convidar(): Promise<void> {
  if (municipioId.value === null) return;
  enviando.value = true;
  erro.value = null;
  erros.value = {};
  convidado.value = null;
  const resultado = await convidarGestor(api, {
    nome: nome.value,
    email: email.value,
    municipio_id: municipioId.value,
  });
  if (resultado.ok) {
    convidado.value = resultado.dados;
    nome.value = '';
    email.value = '';
    formulario.value?.resetValidation();
  } else {
    erros.value = resultado.campos;
    if (!Object.keys(resultado.campos).length) erro.value = resultado.mensagem;
  }
  enviando.value = false;
}

function editou(campo: string): void {
  convidado.value = null;
  delete erros.value[campo];
}

function atualizarMunicipio(valor: string | number | null): void {
  municipioId.value = valor === null || valor === '' ? null : Number(valor);
  editou('municipio_id');
}

const dicaMunicipio = computed(() =>
  municipio.value && municipioId.value === municipio.value.id
    ? `${municipio.value.nome} · ${municipio.value.uf}`
    : 'Código IBGE, com 7 dígitos',
);
</script>

<template>
  <PaginaAdmin titulo="Gestores" subtitulo="Contas de gestor do município">
    <section class="fa-card">
      <h2 class="secao__titulo">Convidar gestor</h2>
      <p class="fa-legenda secao__texto">
        O gestor cuida do órgão e dos agentes do município. Ele recebe um e-mail com um link para
        definir a própria senha.
      </p>
      <q-form ref="formulario" class="fa-formulario" @submit="convidar">
        <CamposConvite v-model:nome="nome" v-model:email="email" :erros="erros" @editou="editou" />
        <q-input
          :model-value="municipioId"
          label="Município"
          type="number"
          inputmode="numeric"
          outlined
          :hint="dicaMunicipio"
          lazy-rules
          :rules="[regraMunicipio]"
          :error="!!erros['municipio_id']"
          :error-message="erros['municipio_id']"
          @update:model-value="atualizarMunicipio"
        />
        <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
        <p v-if="convidado" class="fa-mensagem fa-mensagem--sucesso" role="status">
          Convite enviado para {{ convidado.email }}.
        </p>
        <q-btn
          type="submit"
          unelevated
          no-caps
          color="primary"
          label="Enviar convite"
          :loading="enviando"
          class="fa-botao-largo"
        />
      </q-form>
    </section>
  </PaginaAdmin>
</template>

<style scoped lang="scss">
.secao__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.secao__texto {
  margin: 4px 0 16px;
}
</style>
