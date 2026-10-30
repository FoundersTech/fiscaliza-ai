<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useApi } from '@/boot/api';
import CampoSenha from '@/components/CampoSenha.vue';
import CartaoAcesso from '@/components/CartaoAcesso.vue';
import TextoPolitica from '@/components/TextoPolitica.vue';
import { destinoSeguro } from '@/router/acesso';
import { errosDosCampos, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from '@/services/erros';
import { POLITICA_VERSAO } from '@/services/politica';
import { emailValido, SENHA_MIN, senhaValida, tamanho } from '@/services/validacao';
import { useAuthStore } from '@/stores/auth';

const rota = useRoute();
const router = useRouter();
const api = useApi();
const auth = useAuthStore();

const voltar = computed(() => destinoSeguro(rota.query.voltar));
const consultaLogin = computed(() => (voltar.value === '/' ? {} : { voltar: voltar.value }));

const nome = ref('');
const apelido = ref('');
const email = ref('');
const senha = ref('');
const aceite = ref(false);
const politicaAberta = ref(false);

const enviando = ref(false);
const erro = ref<string | null>(null);
const errosCampo = ref<Record<string, string>>({});

function limparErro(campo: string): void {
  if (errosCampo.value[campo]) errosCampo.value = { ...errosCampo.value, [campo]: '' };
}

function aceitarPeloTexto(): void {
  aceite.value = true;
  politicaAberta.value = false;
}

async function criarConta(): Promise<void> {
  enviando.value = true;
  erro.value = null;
  errosCampo.value = {};
  try {
    const { data, error } = await api.POST('/api/v1/auth/cadastro', {
      body: {
        nome: nome.value,
        apelido_publico: apelido.value,
        email: email.value,
        senha: senha.value,
        politica_versao: POLITICA_VERSAO,
      },
    });
    if (data) {
      auth.iniciarSessao(data);
      await router.replace(voltar.value);
      return;
    }

    const erroApi = lerErroApi(error);
    if (erroApi?.codigo === 'EMAIL_EM_USO') {
      errosCampo.value = { email: erroApi.mensagem };
    } else if (erroApi?.codigo === 'POLITICA_DESATUALIZADA') {
      erro.value = 'A política de privacidade mudou. Recarregue a página para ler a versão nova.';
    } else {
      errosCampo.value = errosDosCampos(erroApi);
      if (Object.keys(errosCampo.value).length === 0) {
        erro.value = mensagemDoErro(erroApi, 'Não foi possível criar a conta. Tente de novo.');
      }
    }
  } catch {
    erro.value = MENSAGEM_SEM_CONEXAO;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoAcesso titulo="Criar conta" subtitulo="Registre e acompanhe os problemas da sua cidade.">
    <q-form class="fa-formulario" @submit="criarConta">
      <q-input
        v-model="nome"
        label="Nome"
        autocomplete="name"
        outlined
        lazy-rules
        :rules="[tamanho(2, 100, 'O nome deve ter de 2 a 100 caracteres')]"
        :error="errosCampo.nome ? true : undefined"
        :error-message="errosCampo.nome"
        @update:model-value="limparErro('nome')"
      />
      <q-input
        v-model="apelido"
        label="Apelido público"
        hint="Aparece nas suas ocorrências, se você quiser."
        autocomplete="nickname"
        outlined
        lazy-rules
        :rules="[tamanho(2, 30, 'O apelido deve ter de 2 a 30 caracteres')]"
        :error="errosCampo.apelido_publico ? true : undefined"
        :error-message="errosCampo.apelido_publico"
        @update:model-value="limparErro('apelido_publico')"
      />
      <q-input
        v-model="email"
        type="email"
        label="E-mail"
        autocomplete="email"
        outlined
        lazy-rules
        :rules="[emailValido]"
        :error="errosCampo.email ? true : undefined"
        :error-message="errosCampo.email"
        @update:model-value="limparErro('email')"
      />
      <CampoSenha
        v-model="senha"
        rotulo="Senha"
        autocomplete="new-password"
        :dica="`Pelo menos ${SENHA_MIN} caracteres.`"
        :regras="[senhaValida]"
        :erro="errosCampo.senha"
        @update:model-value="limparErro('senha')"
      />

      <q-checkbox
        v-model="aceite"
        class="aceite"
        aria-label="Li e aceito a política de privacidade"
      >
        Li e aceito a
        <a href="/politica-privacidade" class="fa-link" @click.stop.prevent="politicaAberta = true">
          política de privacidade
        </a>
      </q-checkbox>

      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Criar conta"
        :disable="!aceite"
        :loading="enviando"
        class="fa-botao-largo"
      />
      <p v-if="!aceite" class="fa-legenda dica-aceite">
        Para criar a conta, aceite a política de privacidade.
      </p>
    </q-form>

    <template #rodape>
      <p class="rodape">
        Já tem conta?
        <router-link :to="{ path: '/login', query: consultaLogin }" class="fa-link">
          Entrar
        </router-link>
      </p>
    </template>
  </CartaoAcesso>

  <q-dialog v-model="politicaAberta">
    <q-card class="dialogo">
      <q-card-section class="dialogo__texto">
        <h2 class="fa-titulo dialogo__titulo">Política de privacidade</h2>
        <TextoPolitica />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-close-popup flat no-caps label="Fechar" />
        <q-btn unelevated no-caps color="primary" label="Li e aceito" @click="aceitarPeloTexto" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.aceite {
  margin: 4px 0 12px -8px;
}

.dica-aceite {
  margin: 0;
  text-align: center;
}

.rodape {
  margin: 4px 0 0;
  color: var(--fa-texto-2);
}

.dialogo {
  width: 100%;
  max-width: 480px;
  border-radius: var(--fa-raio-lg);
}

.dialogo__texto {
  max-height: 60vh;
  overflow-y: auto;
}

.dialogo__titulo {
  font-size: 20px;
  margin-bottom: 8px;
}
</style>
