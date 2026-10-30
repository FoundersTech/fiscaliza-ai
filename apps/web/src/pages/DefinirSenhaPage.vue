<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';

import { useApi } from '@/boot/api';
import CampoSenha from '@/components/CampoSenha.vue';
import CartaoAcesso from '@/components/CartaoAcesso.vue';
import { errosDosCampos, lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from '@/services/erros';
import { igualA, SENHA_MIN, senhaValida } from '@/services/validacao';
import { useAuthStore } from '@/stores/auth';

const rota = useRoute();
const api = useApi();
const auth = useAuthStore();

// O mesmo link serve para a redefinição de senha e para o convite.
const token = typeof rota.query.token === 'string' ? rota.query.token : '';

const estado = ref<'formulario' | 'pronta' | 'invalido'>(token ? 'formulario' : 'invalido');
const senha = ref('');
const confirmacao = ref('');
const enviando = ref(false);
const erro = ref<string | null>(null);
const erroSenha = ref('');

async function salvar(): Promise<void> {
  enviando.value = true;
  erro.value = null;
  erroSenha.value = '';
  try {
    const { response, error } = await api.POST('/api/v1/auth/definir-senha', {
      body: { token, senha: senha.value },
    });
    if (response.ok) {
      // A API encerrou todas as sessões, inclusive a desta aba, se houver.
      auth.encerrarSessao();
      estado.value = 'pronta';
      return;
    }

    const erroApi = lerErroApi(error);
    const campos = errosDosCampos(erroApi);
    if (erroApi?.codigo === 'TOKEN_INVALIDO' || campos['token']) {
      estado.value = 'invalido';
    } else if (campos['senha']) {
      erroSenha.value = campos['senha'];
    } else {
      erro.value = mensagemDoErro(erroApi, 'Não foi possível salvar a senha. Tente de novo.');
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
    v-if="estado === 'formulario'"
    titulo="Definir senha"
    subtitulo="Escolha a senha que você vai usar para entrar."
  >
    <q-form class="fa-formulario" @submit="salvar">
      <CampoSenha
        v-model="senha"
        rotulo="Senha nova"
        autocomplete="new-password"
        :dica="`Pelo menos ${SENHA_MIN} caracteres.`"
        :regras="[senhaValida]"
        :erro="erroSenha"
        @update:model-value="erroSenha = ''"
      />
      <CampoSenha
        v-model="confirmacao"
        rotulo="Repita a senha"
        autocomplete="new-password"
        :regras="[igualA(() => senha, 'As senhas não são iguais')]"
      />
      <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
      <q-btn
        type="submit"
        unelevated
        no-caps
        color="primary"
        label="Salvar senha"
        :loading="enviando"
        class="fa-botao-largo"
      />
    </q-form>
  </CartaoAcesso>

  <CartaoAcesso v-else-if="estado === 'pronta'" titulo="Senha definida">
    <div class="resultado" role="status">
      <q-icon name="sym_o_check_circle" size="32px" class="resultado__icone" />
      <p>Agora entre com a senha nova. As sessões abertas em outros aparelhos foram encerradas.</p>
      <q-btn unelevated no-caps color="primary" to="/login" label="Entrar" class="fa-botao-largo" />
    </div>
  </CartaoAcesso>

  <CartaoAcesso v-else titulo="Link inválido">
    <div class="resultado" role="alert">
      <q-icon name="sym_o_link_off" size="32px" class="resultado__icone" />
      <p>
        Este link não vale mais: ele expira e só pode ser usado uma vez. Peça um novo para criar sua
        senha.
      </p>
      <q-btn
        unelevated
        no-caps
        color="primary"
        to="/esqueci-senha"
        label="Pedir um novo link"
        class="fa-botao-largo"
      />
    </div>
  </CartaoAcesso>
</template>

<style scoped lang="scss">
.resultado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;

  p {
    margin: 0;
  }
}

.resultado__icone {
  color: var(--fa-azul);
}
</style>
