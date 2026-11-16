<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useApi, useSessao } from '@/boot/api';
import BotaoSair from '@/components/BotaoSair.vue';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import CampoSenha from '@/components/CampoSenha.vue';
import { useTema } from '@/composables/useTema';
import {
  cancelarPushNoNavegador,
  consultarExportacao,
  ehLinkExterno,
  excluirConta,
  type Exportacao,
  INTERVALO_EXPORTACAO_MS,
  listarExportacoes,
  rotuloStatusExportacao,
  solicitarExportacao,
  urlFeedbackPiloto,
} from '@/services/conta';
import { ativarPush, desativarPush, type EstadoPush, estadoPush } from '@/services/push';
import type { PreferenciaTema } from '@/services/tema';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { usePendentesStore } from '@/stores/pendentes';
import { dataCurta } from '@/utils/status-ocorrencia';

const api = useApi();
const sessao = useSessao();
const router = useRouter();
const auth = useAuthStore();
const config = useConfigStore();
const pendentes = usePendentesStore();

// Tema
const { preferencia, definirTema } = useTema();
const opcoesTema: { label: string; value: PreferenciaTema }[] = [
  { label: 'Automático', value: 'sistema' },
  { label: 'Claro', value: 'claro' },
  { label: 'Escuro', value: 'escuro' },
];
const tema = computed({
  get: () => preferencia.value,
  set: (nova: PreferenciaTema) => definirTema(nova),
});

// Notificações push
const push = ref<EstadoPush | null>(null);
const alterandoPush = ref(false);
const erroPush = ref<string | null>(null);
const sucessoPush = ref<string | null>(null);

async function consultarPush(): Promise<void> {
  await config.carregar(api);
  push.value = await estadoPush(config.config?.vapid_public_key);
}

async function ativar(): Promise<void> {
  const chave = config.config?.vapid_public_key;
  if (!chave || alterandoPush.value) return;
  alterandoPush.value = true;
  erroPush.value = null;
  sucessoPush.value = null;
  const resultado = await ativarPush(api, chave);
  alterandoPush.value = false;
  if (resultado.tipo === 'ATIVADO') {
    push.value = 'ATIVO';
    sucessoPush.value = 'Notificações ativadas neste aparelho.';
  } else if (resultado.tipo === 'BLOQUEADO') {
    push.value = 'BLOQUEADO';
  } else {
    erroPush.value = resultado.mensagem;
  }
}

async function desativar(): Promise<void> {
  if (alterandoPush.value) return;
  alterandoPush.value = true;
  erroPush.value = null;
  sucessoPush.value = null;
  const resultado = await desativarPush(api);
  alterandoPush.value = false;
  if (resultado.tipo === 'DESATIVADO') {
    push.value = 'DISPONIVEL';
    sucessoPush.value = 'Notificações desativadas neste aparelho.';
  } else {
    erroPush.value = resultado.mensagem;
  }
}

// Exportação dos dados
const exportacao = ref<Exportacao | null>(null);
const carregandoExportacao = ref(true);
const solicitando = ref(false);
const erroExportacao = ref<string | null>(null);
let relogio: ReturnType<typeof setTimeout> | null = null;
let ativa = true;

function pararConsulta(): void {
  if (relogio) clearTimeout(relogio);
  relogio = null;
}

function acompanhar(id: string): void {
  pararConsulta();
  if (!ativa) return;
  relogio = setTimeout(() => {
    void consultarExportacao(api, id).then((resultado) => {
      if (!ativa) return;
      if (resultado.tipo === 'OK') {
        exportacao.value = resultado.exportacao;
        erroExportacao.value = null;
      }
      // Sem conexão, insiste no próximo ciclo enquanto ainda estiver processando.
      if (exportacao.value?.status === 'PROCESSANDO') acompanhar(id);
    });
  }, INTERVALO_EXPORTACAO_MS);
}

async function carregarExportacao(): Promise<void> {
  carregandoExportacao.value = true;
  const resultado = await listarExportacoes(api);
  carregandoExportacao.value = false;
  if (resultado.tipo === 'ERRO') {
    erroExportacao.value = resultado.mensagem;
    return;
  }
  exportacao.value = resultado.itens[0] ?? null;
  if (exportacao.value?.status === 'PROCESSANDO') acompanhar(exportacao.value.id);
}

async function exportar(): Promise<void> {
  if (solicitando.value) return;
  solicitando.value = true;
  erroExportacao.value = null;
  const resultado = await solicitarExportacao(api);
  solicitando.value = false;
  if (resultado.tipo === 'ERRO') {
    erroExportacao.value = resultado.mensagem;
    return;
  }
  exportacao.value = {
    id: resultado.id,
    status: resultado.status,
    solicitada_em: new Date().toISOString(),
  };
  // A API pode devolver uma exportação que já estava pronta: busca o link na hora.
  if (resultado.status === 'PRONTA') {
    const atual = await consultarExportacao(api, resultado.id);
    if (atual.tipo === 'OK') exportacao.value = atual.exportacao;
  } else if (resultado.status === 'PROCESSANDO') {
    acompanhar(resultado.id);
  }
}

const podeExportar = computed(
  () => !carregandoExportacao.value && exportacao.value?.status !== 'PROCESSANDO',
);
const linkDownload = computed(() =>
  exportacao.value?.status === 'PRONTA' ? (exportacao.value.download_url ?? null) : null,
);

// Feedback do piloto
const feedbackUrl = urlFeedbackPiloto();
const feedbackExterno = ehLinkExterno(feedbackUrl);

// Sair e excluir
async function sair(): Promise<void> {
  await router.replace('/');
  await sessao.sair();
}

const excluindo = ref(false);
const dialogoExcluir = ref(false);
const senha = ref('');
const erroSenha = ref<string | undefined>(undefined);
const erroExclusao = ref<string | null>(null);

function abrirExclusao(): void {
  senha.value = '';
  erroSenha.value = undefined;
  erroExclusao.value = null;
  dialogoExcluir.value = true;
}

async function confirmarExclusao(): Promise<void> {
  if (excluindo.value) return;
  if (!senha.value) {
    erroSenha.value = 'Informe sua senha.';
    return;
  }
  excluindo.value = true;
  erroSenha.value = undefined;
  erroExclusao.value = null;
  const resultado = await excluirConta(api, senha.value);
  if (resultado.tipo !== 'EXCLUIDA') {
    excluindo.value = false;
    if (resultado.tipo === 'SENHA_INCORRETA') erroSenha.value = resultado.mensagem;
    else erroExclusao.value = resultado.mensagem;
    return;
  }
  // As pendentes são do usuário que está saindo; o id dele ainda está na sessão aqui.
  try {
    await pendentes.descartarDoUsuario();
  } catch {
    // Sem acesso ao armazenamento local, as pendentes ficam, mas não sobem sem login.
  }
  await cancelarPushNoNavegador();
  pararConsulta();
  dialogoExcluir.value = false;
  senha.value = '';
  await router.replace('/');
  auth.encerrarSessao();
}

onMounted(() => {
  void consultarPush();
  void carregarExportacao();
});
onUnmounted(() => {
  ativa = false;
  pararConsulta();
});
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Minha conta" />

      <section class="fa-card secao" aria-labelledby="conta-dados" data-teste="dados-conta">
        <h2 id="conta-dados" class="secao__titulo">Dados da conta</h2>
        <dl v-if="auth.usuario" class="dados">
          <div>
            <dt>Nome</dt>
            <dd>{{ auth.usuario.nome }}</dd>
          </div>
          <div>
            <dt>Apelido público</dt>
            <dd>{{ auth.usuario.apelido_publico }}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd class="dados__email">{{ auth.usuario.email }}</dd>
          </div>
        </dl>
        <nav class="atalhos" aria-label="Atalhos da conta">
          <router-link to="/minhas-ocorrencias" class="atalho">
            <q-icon name="sym_o_assignment" size="20px" />
            <span>Minhas ocorrências</span>
            <q-icon name="sym_o_chevron_right" size="20px" class="atalho__seta" />
          </router-link>
          <router-link to="/politica-privacidade" class="atalho">
            <q-icon name="sym_o_shield_person" size="20px" />
            <span>Política de privacidade</span>
            <q-icon name="sym_o_chevron_right" size="20px" class="atalho__seta" />
          </router-link>
        </nav>
      </section>

      <section class="fa-card secao" aria-labelledby="conta-tema" data-teste="tema">
        <h2 id="conta-tema" class="secao__titulo">Aparência</h2>
        <p class="secao__texto">No automático, o app segue o tema do aparelho.</p>
        <q-btn-toggle
          v-model="tema"
          :options="opcoesTema"
          no-caps
          unelevated
          spread
          toggle-color="primary"
          class="tema"
          aria-label="Tema do app"
        />
      </section>

      <section class="fa-card secao" aria-labelledby="conta-push" data-teste="push">
        <h2 id="conta-push" class="secao__titulo">Notificações</h2>

        <div v-if="push === null" class="carregando"><q-spinner size="24px" /></div>

        <template v-else-if="push === 'ATIVO' || push === 'DISPONIVEL'">
          <p class="secao__texto">
            {{
              push === 'ATIVO'
                ? 'Este aparelho recebe um aviso quando suas ocorrências mudam de status.'
                : 'Ative para receber um aviso neste aparelho quando suas ocorrências mudarem de status.'
            }}
          </p>
          <q-btn
            v-if="push === 'ATIVO'"
            outline
            no-caps
            color="primary"
            label="Desativar notificações"
            class="fa-botao-largo"
            :loading="alterandoPush"
            data-teste="desativar-push"
            @click="desativar"
          />
          <q-btn
            v-else
            unelevated
            no-caps
            color="primary"
            label="Ativar notificações"
            class="fa-botao-largo"
            :loading="alterandoPush"
            data-teste="ativar-push"
            @click="ativar"
          />
        </template>

        <p v-else-if="push === 'INSTALAR_IOS'" class="secao__texto">
          No iPhone, os avisos chegam quando o app está na Tela de Início. Toque em Compartilhar e
          depois em <strong>Adicionar à Tela de Início</strong>; abra o app por lá e ative aqui.
        </p>
        <p v-else-if="push === 'BLOQUEADO'" class="secao__texto">
          As notificações do Fiscaliza Aí! estão bloqueadas nas configurações do navegador. Libere
          por lá e volte aqui para ativar.
        </p>
        <p v-else-if="push === 'NAO_SUPORTADO'" class="secao__texto">
          Este navegador não recebe notificações. Você continua vendo as novidades na aba Alertas.
        </p>
        <p v-else class="secao__texto">
          As notificações estão indisponíveis no momento. Você continua vendo as novidades na aba
          Alertas.
        </p>

        <p v-if="sucessoPush" class="fa-mensagem fa-mensagem--sucesso" role="status">
          {{ sucessoPush }}
        </p>
        <p v-if="erroPush" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroPush }}</p>
      </section>

      <section class="fa-card secao" aria-labelledby="conta-exportar" data-teste="exportacao">
        <h2 id="conta-exportar" class="secao__titulo">Exportar meus dados</h2>
        <p class="secao__texto">
          Gere um arquivo com seus dados de cadastro, ocorrências, confirmações e avaliações.
        </p>

        <div v-if="carregandoExportacao" class="carregando"><q-spinner size="24px" /></div>

        <div v-else-if="exportacao" class="exportacao" aria-live="polite">
          <div class="exportacao__status">
            <q-spinner v-if="exportacao.status === 'PROCESSANDO'" size="18px" />
            <q-icon
              v-else
              :name="exportacao.status === 'PRONTA' ? 'sym_o_check_circle' : 'sym_o_info'"
              size="18px"
            />
            <strong data-teste="status-exportacao">
              {{ rotuloStatusExportacao(exportacao.status) }}
            </strong>
          </div>
          <span class="fa-legenda">Pedida em {{ dataCurta(exportacao.solicitada_em) }}</span>
          <template v-if="linkDownload">
            <q-btn
              unelevated
              no-caps
              color="primary"
              icon="sym_o_download"
              label="Baixar meus dados"
              class="fa-botao-largo"
              :href="linkDownload"
              target="_blank"
              rel="noopener"
              download
              data-teste="baixar-exportacao"
            />
            <span class="fa-legenda">
              O link de download vale por 15 minutos<template v-if="exportacao.expira_em">
                e o arquivo fica disponível até {{ dataCurta(exportacao.expira_em) }}</template
              >. Se o link vencer, recarregue a tela.
            </span>
          </template>
        </div>

        <p v-if="erroExportacao" class="fa-mensagem fa-mensagem--erro" role="alert">
          {{ erroExportacao }}
        </p>

        <q-btn
          v-if="podeExportar && !linkDownload"
          outline
          no-caps
          color="primary"
          icon="sym_o_upload_file"
          label="Exportar meus dados"
          class="fa-botao-largo"
          :loading="solicitando"
          data-teste="exportar"
          @click="exportar"
        />
      </section>

      <section class="fa-card secao" aria-labelledby="conta-feedback">
        <h2 id="conta-feedback" class="secao__titulo">Feedback do piloto</h2>
        <p class="secao__texto">
          Conte o que funcionou e o que pode melhorar. Sua opinião orienta as próximas versões.
        </p>
        <a
          :href="feedbackUrl"
          class="atalho"
          v-bind="feedbackExterno ? { target: '_blank', rel: 'noopener noreferrer' } : {}"
          data-teste="feedback"
        >
          <q-icon name="sym_o_rate_review" size="20px" />
          <span>Enviar feedback do piloto</span>
          <q-icon name="sym_o_open_in_new" size="20px" class="atalho__seta" />
        </a>
      </section>

      <BotaoSair @sair="sair" />

      <section class="fa-card secao perigo" aria-labelledby="conta-excluir" data-teste="excluir">
        <h2 id="conta-excluir" class="secao__titulo">Excluir conta</h2>
        <p class="secao__texto">
          A exclusão anonimiza seus dados e encerra suas sessões. As ocorrências que você registrou
          continuam públicas, sem identificar o autor. Não é possível desfazer.
        </p>
        <q-btn
          outline
          no-caps
          color="negative"
          label="Excluir minha conta"
          class="fa-botao-largo"
          data-teste="abrir-exclusao"
          @click="abrirExclusao"
        />
      </section>
    </div>

    <q-dialog v-model="dialogoExcluir" :persistent="excluindo">
      <q-card class="dialogo" role="alertdialog" aria-labelledby="dialogo-excluir-titulo">
        <q-form @submit.prevent="confirmarExclusao">
          <q-card-section class="dialogo__corpo">
            <h2 id="dialogo-excluir-titulo" class="fa-titulo">Excluir sua conta?</h2>
            <p>
              Seus dados pessoais serão anonimizados e você sai do app. As ocorrências continuam
              públicas, sem seu nome. Digite sua senha para confirmar.
            </p>
            <CampoSenha
              v-model="senha"
              rotulo="Senha"
              autocomplete="current-password"
              :erro="erroSenha"
              data-teste="senha-exclusao"
            />
            <p v-if="erroExclusao" class="fa-mensagem fa-mensagem--erro" role="alert">
              {{ erroExclusao }}
            </p>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat no-caps label="Cancelar" :disable="excluindo" />
            <q-btn
              type="submit"
              unelevated
              no-caps
              color="negative"
              label="Excluir conta"
              :loading="excluindo"
              data-teste="confirmar-exclusao"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.secao {
  display: flex;
  flex-direction: column;
  gap: 12px;

  p {
    margin: 0;
  }
}

.secao__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.secao__texto {
  color: var(--fa-texto-2);
  font-size: 14px;
}

.dados {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;

  div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  dt {
    font-size: 13px;
    color: var(--fa-texto-3);
  }

  dd {
    margin: 0;
  }
}

.dados__email {
  overflow-wrap: anywhere;
}

.atalhos {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--fa-borda);
}

.atalho {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  color: var(--fa-texto);
  text-decoration: none;
  border-bottom: 1px solid var(--fa-borda);

  &:last-child {
    border-bottom: none;
  }

  > :first-child {
    color: var(--fa-azul);
  }

  span {
    flex: 1;
  }

  &:focus-visible {
    outline: 2px solid var(--fa-azul);
    outline-offset: 2px;
    border-radius: var(--fa-raio-sm);
  }
}

.atalho__seta {
  color: var(--fa-texto-3);
}

.tema {
  border: 1px solid var(--fa-borda-forte);
  border-radius: var(--fa-raio-sm);
}

.carregando {
  display: flex;
  justify-content: center;
  color: var(--fa-azul);
}

.exportacao {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.exportacao__status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fa-texto);
}

.perigo {
  border-color: color-mix(in srgb, var(--fa-urgente) 40%, var(--fa-borda));
}

.dialogo {
  max-width: 400px;
  width: 100%;
}

.dialogo__corpo {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h2,
  p {
    margin: 0;
  }

  > p {
    color: var(--fa-texto-2);
  }
}
</style>
