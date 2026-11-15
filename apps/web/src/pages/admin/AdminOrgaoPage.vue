<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import PaginaAdmin from '@/components/admin/PaginaAdmin.vue';
import { carregarOrgao, editarOrgao, type Orgao, SIGLA_REGEX } from '@/services/administracao';
import { tamanho } from '@/services/validacao';

const api = useApi();

const orgao = ref<Orgao | null>(null);
const nome = ref('');
const sigla = ref('');
const carregando = ref(true);
const erroCarga = ref<string | null>(null);
const salvando = ref(false);
const erro = ref<string | null>(null);
const salvo = ref(false);
const errosCampos = ref<Record<string, string>>({});

async function carregar(): Promise<void> {
  carregando.value = true;
  erroCarga.value = null;
  const resultado = await carregarOrgao(api);
  if (resultado.ok) preencher(resultado.dados);
  else erroCarga.value = resultado.mensagem;
  carregando.value = false;
}

function preencher(dados: Orgao): void {
  orgao.value = dados;
  nome.value = dados.nome;
  sigla.value = dados.sigla;
}

onMounted(carregar);

async function salvar(): Promise<void> {
  if (!orgao.value) return;
  salvando.value = true;
  erro.value = null;
  salvo.value = false;
  errosCampos.value = {};
  const resultado = await editarOrgao(api, orgao.value, { nome: nome.value, sigla: sigla.value });
  if (resultado.ok) {
    preencher(resultado.dados);
    salvo.value = true;
  } else {
    errosCampos.value = resultado.campos;
    if (!Object.keys(resultado.campos).length) erro.value = resultado.mensagem;
  }
  salvando.value = false;
}

function limparAviso(campo: string): void {
  salvo.value = false;
  delete errosCampos.value[campo];
}

const regraNome = tamanho(2, 100, 'O nome deve ter de 2 a 100 caracteres');
const regraSigla = (valor: string) =>
  SIGLA_REGEX.test(valor.trim().toUpperCase()) ||
  'A sigla deve ter de 2 a 10 letras maiúsculas ou números';
</script>

<template>
  <PaginaAdmin titulo="Órgão" subtitulo="Nome e sigla que aparecem nas ocorrências">
    <div v-if="carregando" class="fa-estado"><q-spinner size="28px" color="primary" /></div>

    <div v-else-if="erroCarga" class="fa-estado">
      <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroCarga }}</p>
      <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregar" />
    </div>

    <q-form v-else class="fa-card fa-formulario" @submit="salvar">
      <q-input
        v-model="nome"
        label="Nome do órgão"
        outlined
        maxlength="100"
        lazy-rules
        :rules="[regraNome]"
        :error="!!errosCampos['nome']"
        :error-message="errosCampos['nome']"
        @update:model-value="limparAviso('nome')"
      />
      <q-input
        :model-value="sigla"
        label="Sigla"
        hint="De 2 a 10 letras maiúsculas ou números"
        outlined
        maxlength="10"
        lazy-rules
        :rules="[regraSigla]"
        :error="!!errosCampos['sigla']"
        :error-message="errosCampos['sigla']"
        @update:model-value="
          sigla = String($event ?? '').toUpperCase();
          limparAviso('sigla');
        "
      />
      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
      <p v-if="salvo" class="fa-mensagem fa-mensagem--sucesso" role="status">
        Dados do órgão salvos.
      </p>
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Salvar"
        :loading="salvando"
        class="fa-botao-largo"
      />
    </q-form>
  </PaginaAdmin>
</template>
