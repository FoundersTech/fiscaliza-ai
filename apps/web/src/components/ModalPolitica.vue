<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { useApi, useSessao } from '@/boot/api';
import TextoPolitica from '@/components/TextoPolitica.vue';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from '@/services/erros';
import { POLITICA_VERSAO } from '@/services/politica';
import { useAuthStore } from '@/stores/auth';

const api = useApi();
const sessao = useSessao();
const auth = useAuthStore();
const router = useRouter();

const enviando = ref(false);
const erro = ref<string | null>(null);
// A API já tem uma versão mais nova que o texto deste app: só recarregando para ler.
const textoAntigo = ref(false);

async function aceitar(): Promise<void> {
  enviando.value = true;
  erro.value = null;
  try {
    const { response, error } = await api.POST('/api/v1/me/politica', {
      body: { versao: POLITICA_VERSAO },
    });
    if (response.ok) {
      auth.marcarPolitica(false);
      return;
    }
    const erroApi = lerErroApi(error);
    if (erroApi?.codigo === 'POLITICA_DESATUALIZADA') textoAntigo.value = true;
    else
      erro.value = mensagemDoErro(erroApi, 'Não foi possível registrar o aceite. Tente de novo.');
  } catch {
    erro.value = MENSAGEM_SEM_CONEXAO;
  } finally {
    enviando.value = false;
  }
}

async function sair(): Promise<void> {
  await router.replace('/');
  await sessao.sair();
}

function recarregar(): void {
  globalThis.location.reload();
}
</script>

<template>
  <q-dialog :model-value="auth.precisaAceitarPolitica" persistent no-esc-dismiss no-route-dismiss>
    <q-card class="modal" role="alertdialog" aria-labelledby="modal-politica-titulo">
      <q-card-section>
        <h2 id="modal-politica-titulo" class="fa-titulo modal__titulo">
          Nossa política de privacidade mudou
        </h2>
        <p class="modal__intro">
          Para continuar usando o Fiscaliza Aí!, leia e aceite a versão nova.
        </p>
      </q-card-section>

      <q-card-section class="modal__texto">
        <TextoPolitica />
      </q-card-section>

      <q-card-section class="modal__acoes">
        <template v-if="textoAntigo">
          <p class="fa-mensagem fa-mensagem--erro" role="alert">
            Há uma versão ainda mais nova da política. Recarregue o app para ler.
          </p>
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Recarregar"
            class="fa-botao-largo"
            @click="recarregar"
          />
        </template>
        <template v-else>
          <p v-if="erro" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Li e aceito"
            :loading="enviando"
            class="fa-botao-largo"
            @click="aceitar"
          />
        </template>
        <q-btn flat no-caps label="Sair da conta" class="fa-botao-largo" @click="sair" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped lang="scss">
.modal {
  width: 100%;
  max-width: 480px;
  border-radius: var(--fa-raio-lg);
}

.modal__titulo {
  font-size: 20px;
}

.modal__intro {
  margin: 8px 0 0;
  color: var(--fa-texto-2);
}

.modal__texto {
  max-height: 40vh;
  overflow-y: auto;
  border-top: 1px solid var(--fa-borda);
  border-bottom: 1px solid var(--fa-borda);
}

.modal__acoes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
