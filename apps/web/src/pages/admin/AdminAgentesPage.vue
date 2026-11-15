<script setup lang="ts">
import type { QForm } from 'quasar';
import { onMounted, ref } from 'vue';

import { useApi } from '@/boot/api';
import CamposConvite from '@/components/admin/CamposConvite.vue';
import DialogoAdmin from '@/components/admin/DialogoAdmin.vue';
import PaginaAdmin from '@/components/admin/PaginaAdmin.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import {
  type Agente,
  alterarAgente,
  comAgente,
  convidarAgente,
  listarAgentes,
} from '@/services/administracao';

const api = useApi();

const agentes = ref<Agente[]>([]);
const carregando = ref(true);
const erroCarga = ref<string | null>(null);

const formulario = ref<QForm | null>(null);
const nome = ref('');
const email = ref('');
const convidando = ref(false);
const erroConvite = ref<string | null>(null);
const errosConvite = ref<Record<string, string>>({});
const convidado = ref<string | null>(null);

/** Agente com a alteração em andamento, e o que pede confirmação para desativar. */
const alterando = ref<string | null>(null);
const aDesativar = ref<Agente | null>(null);
const erroAlteracao = ref<string | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erroCarga.value = null;
  const resultado = await listarAgentes(api);
  if (resultado.ok) agentes.value = resultado.dados;
  else erroCarga.value = resultado.mensagem;
  carregando.value = false;
}

onMounted(carregar);

async function convidar(): Promise<void> {
  convidando.value = true;
  erroConvite.value = null;
  errosConvite.value = {};
  convidado.value = null;
  const resultado = await convidarAgente(api, { nome: nome.value, email: email.value });
  if (resultado.ok) {
    agentes.value = comAgente(agentes.value, resultado.dados);
    convidado.value = resultado.dados.email;
    nome.value = '';
    email.value = '';
    formulario.value?.resetValidation();
  } else {
    errosConvite.value = resultado.campos;
    if (!Object.keys(resultado.campos).length) erroConvite.value = resultado.mensagem;
  }
  convidando.value = false;
}

function editou(campo: string): void {
  convidado.value = null;
  delete errosConvite.value[campo];
}

function pedirAlteracao(agente: Agente): void {
  erroAlteracao.value = null;
  if (agente.ativo) aDesativar.value = agente;
  else void alterar(agente, true);
}

async function alterar(agente: Agente, ativo: boolean): Promise<void> {
  alterando.value = agente.id;
  erroAlteracao.value = null;
  const resultado = await alterarAgente(api, agente.id, ativo);
  if (resultado.ok) agentes.value = comAgente(agentes.value, resultado.dados);
  else erroAlteracao.value = resultado.mensagem;
  alterando.value = null;
  aDesativar.value = null;
}

function situacao(agente: Agente): string {
  if (!agente.ativo) return 'Desativado';
  return agente.convite_pendente ? 'Convite pendente' : 'Ativo';
}
</script>

<template>
  <PaginaAdmin titulo="Agentes" subtitulo="Quem atende as ocorrências pelo órgão">
    <section class="fa-card">
      <h2 class="secao__titulo">Convidar agente</h2>
      <p class="fa-legenda secao__texto">
        O agente recebe um e-mail com um link para definir a própria senha.
      </p>
      <q-form ref="formulario" class="fa-formulario" @submit="convidar">
        <CamposConvite
          v-model:nome="nome"
          v-model:email="email"
          :erros="errosConvite"
          @editou="editou"
        />
        <p v-if="erroConvite" class="fa-mensagem fa-mensagem--erro" role="alert">
          {{ erroConvite }}
        </p>
        <p v-if="convidado" class="fa-mensagem fa-mensagem--sucesso" role="status">
          Convite enviado para {{ convidado }}.
        </p>
        <q-btn
          type="submit"
          unelevated
          no-caps
          color="primary"
          label="Enviar convite"
          :loading="convidando"
          class="fa-botao-largo"
        />
      </q-form>
    </section>

    <div v-if="carregando" class="fa-estado"><q-spinner size="28px" color="primary" /></div>

    <div v-else-if="erroCarga" class="fa-estado">
      <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroCarga }}</p>
      <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregar" />
    </div>

    <EstadoVazio
      v-else-if="!agentes.length"
      icone="sym_o_badge"
      titulo="Nenhum agente ainda"
      texto="Convide quem vai atender as ocorrências do órgão."
    />

    <section v-else class="fa-card lista">
      <h2 class="secao__titulo">Agentes do órgão</h2>
      <p v-if="erroAlteracao" class="fa-mensagem fa-mensagem--erro" role="alert">
        {{ erroAlteracao }}
      </p>
      <ul class="lista__itens">
        <li v-for="agente in agentes" :key="agente.id" class="lista__item">
          <div class="lista__dados">
            <span class="lista__nome">{{ agente.nome }}</span>
            <span class="fa-legenda">{{ agente.email }}</span>
            <span
              class="lista__situacao"
              :class="{
                'lista__situacao--inativo': !agente.ativo,
                'lista__situacao--pendente': agente.ativo && agente.convite_pendente,
              }"
            >
              {{ situacao(agente) }}
            </span>
          </div>
          <q-toggle
            :model-value="agente.ativo"
            :disable="alterando === agente.id"
            color="primary"
            :aria-label="agente.ativo ? `Desativar ${agente.nome}` : `Reativar ${agente.nome}`"
            @update:model-value="pedirAlteracao(agente)"
          />
        </li>
      </ul>
    </section>

    <DialogoAdmin
      :model-value="aDesativar !== null"
      :titulo="`Desativar ${aDesativar?.nome ?? ''}?`"
      :ocupado="alterando !== null"
      @update:model-value="aDesativar = null"
    >
      <p>
        O agente sai na hora de todos os aparelhos e não consegue mais entrar. Nada do que ele fez é
        apagado, e você pode reativá-lo depois.
      </p>
      <template #acoes>
        <q-btn
          unelevated
          no-caps
          color="negative"
          label="Desativar"
          :loading="alterando !== null"
          @click="aDesativar && alterar(aDesativar, false)"
        />
      </template>
    </DialogoAdmin>
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

.lista {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lista__itens {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lista__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;

  & + & {
    border-top: 1px solid var(--fa-borda);
  }
}

.lista__dados {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.lista__nome {
  font-weight: 600;
}

.lista__situacao {
  align-self: flex-start;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 500;
  background: var(--fa-resolvido-fundo);
  color: var(--fa-resolvido-texto);

  &--pendente {
    background: var(--fa-recebido-fundo);
    color: var(--fa-recebido-texto);
  }

  &--inativo {
    background: var(--fa-superficie-2);
    color: var(--fa-texto-3);
  }
}
</style>
