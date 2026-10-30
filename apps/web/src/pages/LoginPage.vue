<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useApi } from '@/boot/api';
import CampoSenha from '@/components/CampoSenha.vue';
import CartaoAcesso from '@/components/CartaoAcesso.vue';
import { destinoSeguro } from '@/router/acesso';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from '@/services/erros';
import { obrigatorio } from '@/services/validacao';
import { useAuthStore } from '@/stores/auth';

const rota = useRoute();
const router = useRouter();
const api = useApi();
const auth = useAuthStore();

const voltar = computed(() => destinoSeguro(rota.query.voltar));
// Quem ainda não tem conta segue para o cadastro com o mesmo voltar.
const consultaCadastro = computed(() => (voltar.value === '/' ? {} : { voltar: voltar.value }));

const email = ref('');
const senha = ref('');
const enviando = ref(false);
const erro = ref<string | null>(null);

async function entrar(): Promise<void> {
  enviando.value = true;
  erro.value = null;
  try {
    const { data, error } = await api.POST('/api/v1/auth/login', {
      body: { email: email.value, senha: senha.value },
    });
    if (data) {
      auth.iniciarSessao(data);
      await router.replace(voltar.value);
      return;
    }
    erro.value = mensagemDoErro(lerErroApi(error), 'Não foi possível entrar. Tente de novo.');
  } catch {
    erro.value = MENSAGEM_SEM_CONEXAO;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoAcesso
    titulo="Entrar"
    :subtitulo="
      voltar === '/'
        ? 'Acompanhe e registre ocorrências em Sorocaba.'
        : 'Entre para continuar de onde parou.'
    "
  >
    <q-form class="fa-formulario" @submit="entrar">
      <q-input
        v-model="email"
        type="email"
        label="E-mail"
        autocomplete="username"
        outlined
        lazy-rules
        :rules="[obrigatorio('Informe o e-mail')]"
      />
      <CampoSenha
        v-model="senha"
        rotulo="Senha"
        autocomplete="current-password"
        :regras="[obrigatorio('Informe a senha')]"
      />
      <router-link to="/esqueci-senha" class="fa-link esqueci">Esqueci minha senha</router-link>

      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Entrar"
        :loading="enviando"
        class="fa-botao-largo"
      />
    </q-form>

    <template #rodape>
      <p class="rodape">
        Ainda não tem conta?
        <router-link :to="{ path: '/cadastro', query: consultaCadastro }" class="fa-link">
          Criar conta
        </router-link>
      </p>
      <router-link to="/" class="fa-link">Continuar sem entrar</router-link>
    </template>
  </CartaoAcesso>
</template>

<style scoped lang="scss">
.esqueci {
  align-self: flex-end;
  margin: -4px 0 12px;
  font-size: 13px;
}

.rodape {
  margin: 4px 0 0;
  color: var(--fa-texto-2);
}
</style>
