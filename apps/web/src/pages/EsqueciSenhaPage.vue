<script setup lang="ts">
import { ref } from 'vue';

import { useApi } from '@/boot/api';
import CartaoAcesso from '@/components/CartaoAcesso.vue';
import { errosDosCampos, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from '@/services/erros';
import { emailValido } from '@/services/validacao';

const api = useApi();

const email = ref('');
const enviado = ref(false);
const enviando = ref(false);
const erro = ref<string | null>(null);
const erroEmail = ref('');

async function enviar(): Promise<void> {
  enviando.value = true;
  erro.value = null;
  erroEmail.value = '';
  try {
    const { response, error } = await api.POST('/api/v1/auth/esqueci-senha', {
      body: { email: email.value },
    });
    if (response.ok) {
      enviado.value = true;
      return;
    }
    const erroApi = lerErroApi(error);
    erroEmail.value = errosDosCampos(erroApi)['email'] ?? '';
    if (!erroEmail.value) {
      erro.value = mensagemDoErro(erroApi, 'Não foi possível enviar o link. Tente de novo.');
    }
  } catch {
    erro.value = MENSAGEM_SEM_CONEXAO;
  } finally {
    enviando.value = false;
  }
}
</script>

<template>
  <CartaoAcesso
    titulo="Esqueci minha senha"
    subtitulo="Informe o e-mail da conta para receber o link de uma senha nova."
  >
    <div v-if="enviado" class="enviado" role="status">
      <q-icon name="sym_o_mark_email_read" size="32px" class="enviado__icone" />
      <p class="enviado__email">{{ email.trim() }}</p>
      <p>
        Se houver uma conta com este e-mail, ela vai receber um link para criar uma senha nova. O
        link vale por 1 hora e só pode ser usado uma vez.
      </p>
      <p class="fa-legenda">Não chegou? Confira a caixa de spam.</p>
    </div>

    <q-form v-else class="fa-formulario" @submit="enviar">
      <q-input
        v-model="email"
        type="email"
        label="E-mail da conta"
        autocomplete="email"
        outlined
        lazy-rules
        :rules="[emailValido]"
        :error="erroEmail ? true : undefined"
        :error-message="erroEmail"
        @update:model-value="erroEmail = ''"
      />
      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Enviar link"
        :loading="enviando"
        class="fa-botao-largo"
      />
    </q-form>

    <template #rodape>
      <router-link to="/login" class="fa-link">Voltar para a entrada</router-link>
    </template>
  </CartaoAcesso>
</template>

<style scoped lang="scss">
.enviado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;

  p {
    margin: 0;
  }
}

.enviado__email {
  font-weight: 600;
  word-break: break-all;
}

.enviado__icone {
  color: var(--fa-azul);
}
</style>
