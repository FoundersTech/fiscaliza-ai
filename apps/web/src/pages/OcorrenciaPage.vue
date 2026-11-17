<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useApi } from '@/boot/api';
import SeloReaberta from '@/components/atendimento/SeloReaberta.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import SeloStatus from '@/components/ocorrencia/SeloStatus.vue';
import { historicoAnteriorSeguro } from '@/router/acesso';
import { confirmarOcorrencia } from '@/services/envio';
import {
  aplicarConfirmacao,
  atributosLegiveis,
  buscarDetalhe,
  compartilhar,
  type Detalhe,
  estadoTambemVi,
  montarLinhaDoTempo,
} from '@/services/ocorrencia';
import {
  aplicarAvaliacao,
  avaliarOcorrencia,
  COMENTARIO_AVALIACAO_MAX,
  type ErroPosResolucao,
  estaReaberta,
  JUSTIFICATIVA_REABERTURA_MAX,
  NOTA_MAX,
  problemaDaJustificativa,
  problemasDaAvaliacao,
  reabrirOcorrencia,
  textoDoPrazo,
} from '@/services/pos-resolucao';
import { useAuthStore } from '@/stores/auth';
import { useConfigStore } from '@/stores/config';
import { dataCurta, textoDosDiasVisivel } from '@/utils/status-ocorrencia';

const api = useApi();
const rota = useRoute();
const router = useRouter();
const auth = useAuthStore();
const config = useConfigStore();

const detalhe = shallowRef<Detalhe | null>(null);
const carregando = ref(true);
const naoEncontrada = ref(false);
const erro = ref<string | null>(null);
const confirmando = ref(false);
const avisoConfirmacao = ref<string | null>(null);
const avisoCompartilhar = ref<string | null>(null);
/** Confirmação de avaliação ou reabertura, e a recusa que fez a tela recarregar. */
const avisoPosResolucao = ref<string | null>(null);
const erroPosResolucao = ref<string | null>(null);

const avaliacaoAberta = ref(false);
const nota = ref<number | null>(null);
const comentario = ref('');
const tentouAvaliar = ref(false);
const avaliando = ref(false);
const erroAvaliacao = ref<string | null>(null);
const camposAvaliacao = ref<Record<string, string>>({});

const reaberturaAberta = ref(false);
const justificativa = ref('');
const tentouReabrir = ref(false);
const reabrindo = ref(false);
const erroReabertura = ref<string | null>(null);
const camposReabertura = ref<Record<string, string>>({});

const id = computed(() => String(rota.params['id'] ?? ''));

async function carregar(): Promise<void> {
  const pedido = id.value;
  carregando.value = true;
  erro.value = null;
  const resultado = await buscarDetalhe(api, pedido);
  if (pedido !== id.value) return;
  carregando.value = false;
  naoEncontrada.value = resultado.tipo === 'NAO_ENCONTRADA';
  if (resultado.tipo === 'OK') detalhe.value = resultado.detalhe;
  else if (resultado.tipo === 'ERRO') erro.value = resultado.mensagem;
  else detalhe.value = null;
}

watch(id, () => {
  detalhe.value = null;
  avisoConfirmacao.value = null;
  avisoCompartilhar.value = null;
  avisoPosResolucao.value = null;
  erroPosResolucao.value = null;
  avaliacaoAberta.value = false;
  reaberturaAberta.value = false;
  void carregar();
});
// Entrar ou sair muda o que a API devolve para quem está vendo (botões e campos pessoais).
watch(
  () => auth.logado,
  () => void carregar(),
);
void carregar();
void config.carregar(api);

const estadoBotao = computed(() =>
  detalhe.value ? estadoTambemVi(detalhe.value, auth.logado) : 'OCULTO',
);
const passos = computed(() => (detalhe.value ? montarLinhaDoTempo(detalhe.value) : []));
const dias = computed(() =>
  detalhe.value
    ? textoDosDiasVisivel(detalhe.value.dias_em_aberto, detalhe.value.status_publico)
    : null,
);
const atributos = computed(() => {
  if (!detalhe.value) return [];
  const categoria = config.categorias.find((c) => c.slug === detalhe.value?.categoria.slug);
  return atributosLegiveis(detalhe.value.atributos, categoria?.schema_atributos ?? []);
});
const textoConfirmacoes = computed(() => {
  const total = detalhe.value?.confirmacoes ?? 0;
  if (total === 0) return 'Ninguém confirmou ainda';
  return total === 1 ? '1 pessoa também viu' : `${total} pessoas também viram`;
});

function voltar(): void {
  if (historicoAnteriorSeguro(window.history.state?.back)) router.back();
  else void router.replace('/');
}

async function tambemVi(): Promise<void> {
  const atual = detalhe.value;
  if (!atual || confirmando.value) return;
  if (estadoBotao.value === 'ENTRAR') {
    await router.push({ path: '/login', query: { voltar: rota.fullPath } });
    return;
  }
  confirmando.value = true;
  avisoConfirmacao.value = null;
  const resultado = await confirmarOcorrencia(api, atual.id);
  confirmando.value = false;
  if (detalhe.value?.id !== atual.id) return;
  const depois = aplicarConfirmacao(
    detalhe.value,
    resultado,
    config.config?.urgente_min_confirmacoes ?? null,
  );
  detalhe.value = depois.detalhe;
  avisoConfirmacao.value = depois.mensagem;
  // A recusa pode vir de uma mudança que a tela não viu (a ocorrência fechou, por exemplo).
  if (resultado.tipo === 'ERRO') void carregar();
}

async function compartilharOcorrencia(): Promise<void> {
  const atual = detalhe.value;
  if (!atual) return;
  const url = new URL(router.resolve(`/ocorrencias/${atual.id}`).href, window.location.origin).href;
  const resultado = await compartilhar({
    titulo: `${atual.categoria.nome} · Fiscaliza Aí!`,
    texto: `${atual.resumo} (protocolo ${atual.protocolo})`,
    url,
  });
  avisoCompartilhar.value =
    resultado === 'COPIADO'
      ? 'Link copiado. É só colar onde quiser compartilhar.'
      : resultado === 'INDISPONIVEL'
        ? `Copie o link para compartilhar: ${url}`
        : null;
}

// Depois de resolvida: só o autor e quem confirmou avaliam ou reabrem, até o prazo.
const podeAvaliar = computed(() => auth.logado && !!detalhe.value?.pode_avaliar);
const podeReabrir = computed(() => auth.logado && !!detalhe.value?.pode_reabrir);
const textoPrazo = computed(() =>
  podeAvaliar.value || podeReabrir.value
    ? textoDoPrazo(detalhe.value?.prazo_pos_resolucao_ate)
    : null,
);
const reaberta = computed(() => (detalhe.value ? estaReaberta(detalhe.value) : false));
const estrelas = Array.from({ length: NOTA_MAX }, (_, indice) => indice + 1);

const problemasAvaliacao = computed(() =>
  tentouAvaliar.value
    ? problemasDaAvaliacao({ nota: nota.value, comentario: comentario.value })
    : {},
);
const problemaComentario = computed(
  () => problemasAvaliacao.value.comentario ?? camposAvaliacao.value['comentario'] ?? null,
);
const problemaJustificativa = computed(() =>
  tentouReabrir.value
    ? (problemaDaJustificativa(justificativa.value) ??
      camposReabertura.value['justificativa'] ??
      null)
    : null,
);

function rotuloEstrela(valor: number): string {
  return valor === 1 ? '1 estrela' : `${valor} estrelas`;
}

function abrirAvaliacao(): void {
  nota.value = null;
  comentario.value = '';
  tentouAvaliar.value = false;
  erroAvaliacao.value = null;
  camposAvaliacao.value = {};
  avaliacaoAberta.value = true;
}

function abrirReabertura(): void {
  justificativa.value = '';
  tentouReabrir.value = false;
  erroReabertura.value = null;
  camposReabertura.value = {};
  reaberturaAberta.value = true;
}

/** A recusa vem de uma mudança que a tela não viu: fecha o formulário e traz o detalhe de novo. */
function recusaDesatualizada(resultado: ErroPosResolucao): void {
  avaliacaoAberta.value = false;
  reaberturaAberta.value = false;
  erroPosResolucao.value = resultado.mensagem;
  void carregar();
}

async function enviarAvaliacao(): Promise<void> {
  const atual = detalhe.value;
  if (!atual || avaliando.value) return;
  tentouAvaliar.value = true;
  camposAvaliacao.value = {};
  erroAvaliacao.value = null;
  if (Object.keys(problemasAvaliacao.value).length > 0 || nota.value === null) return;

  avaliando.value = true;
  const resultado = await avaliarOcorrencia(api, atual.id, {
    nota: nota.value,
    comentario: comentario.value,
  });
  avaliando.value = false;
  if (detalhe.value?.id !== atual.id) return;

  if (resultado.tipo === 'ERRO') {
    if (resultado.recarregar) recusaDesatualizada(resultado);
    else {
      erroAvaliacao.value = resultado.mensagem;
      camposAvaliacao.value = resultado.campos;
    }
    return;
  }
  detalhe.value = aplicarAvaliacao(detalhe.value);
  avaliacaoAberta.value = false;
  erroPosResolucao.value = null;
  avisoPosResolucao.value =
    resultado.tipo === 'AVALIADA'
      ? 'Avaliação registrada. Obrigado por avaliar o atendimento.'
      : 'Você já tinha avaliado este atendimento.';
}

async function enviarReabertura(): Promise<void> {
  const atual = detalhe.value;
  if (!atual || reabrindo.value) return;
  tentouReabrir.value = true;
  camposReabertura.value = {};
  erroReabertura.value = null;
  if (problemaDaJustificativa(justificativa.value)) return;

  reabrindo.value = true;
  const resultado = await reabrirOcorrencia(api, atual.id, justificativa.value);
  reabrindo.value = false;
  if (detalhe.value?.id !== atual.id) return;

  if (resultado.tipo === 'ERRO') {
    if (resultado.recarregar) recusaDesatualizada(resultado);
    else {
      erroReabertura.value = resultado.mensagem;
      camposReabertura.value = resultado.campos;
    }
    return;
  }
  reaberturaAberta.value = false;
  erroPosResolucao.value = null;
  avisoPosResolucao.value = 'Ocorrência reaberta e devolvida para análise da prefeitura.';
  // Os botões somem já; o status e a linha do tempo vêm da API, com a reabertura.
  detalhe.value = { ...detalhe.value, pode_avaliar: false, pode_reabrir: false };
  await carregar();
}
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <header class="topo">
        <q-btn
          round
          flat
          class="fa-botao-redondo"
          icon="sym_o_arrow_back"
          aria-label="Voltar"
          @click="voltar"
        />
        <h1 class="topo__titulo">Ocorrência</h1>
        <q-btn
          v-if="detalhe"
          round
          flat
          class="fa-botao-redondo"
          icon="sym_o_share"
          aria-label="Compartilhar"
          @click="compartilharOcorrencia"
        />
      </header>

      <div v-if="carregando && !detalhe" class="carregando"><q-spinner size="32px" /></div>

      <EstadoVazio
        v-else-if="naoEncontrada"
        icone="sym_o_search_off"
        titulo="Ocorrência não encontrada"
        texto="O link pode estar errado, ou a ocorrência não está mais disponível."
      >
        <q-btn unelevated no-caps color="primary" label="Ver ocorrências" to="/" />
      </EstadoVazio>

      <div v-else-if="erro && !detalhe" class="secao">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ erro }}</p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="carregar" />
      </div>

      <template v-if="detalhe">
        <p v-if="avisoCompartilhar" class="aviso" role="status" data-teste="aviso-compartilhar">
          {{ avisoCompartilhar }}
        </p>

        <div v-if="detalhe.fotos.length > 0" class="fotos">
          <a
            v-for="(foto, indice) in detalhe.fotos"
            :key="foto.url"
            :href="foto.url"
            target="_blank"
            rel="noopener"
            class="fotos__item"
          >
            <img :src="foto.url" :alt="`Foto ${indice + 1} da ocorrência`" decoding="async" />
          </a>
        </div>
        <div v-else class="sem-foto">
          <q-icon name="sym_o_image" size="20px" />
          {{ detalhe.foto_em_analise ? 'Foto em análise' : 'Sem foto' }}
        </div>

        <section class="resumo">
          <div class="resumo__selos">
            <SeloStatus :status="detalhe.status_publico" />
            <span v-if="detalhe.urgente" class="urgente" data-teste="urgente">Urgente</span>
            <SeloReaberta v-if="reaberta" data-teste="reaberta" />
          </div>
          <span class="fa-sobrelinha">{{ detalhe.categoria.nome }}</span>
          <p class="resumo__descricao">{{ detalhe.descricao }}</p>
          <p class="resumo__linha">
            <q-icon name="sym_o_location_on" size="16px" />
            <span>{{ detalhe.endereco ?? 'Endereço será preenchido depois' }}</span>
          </p>
          <dl v-if="atributos.length > 0" class="atributos">
            <template v-for="atributo in atributos" :key="atributo.rotulo">
              <dt>{{ atributo.rotulo }}</dt>
              <dd>{{ atributo.valor }}</dd>
            </template>
          </dl>
          <span class="fa-legenda">
            Protocolo <strong>{{ detalhe.protocolo }}</strong>
            <template v-if="dias"> · {{ dias }}</template>
            <template v-if="detalhe.autor_apelido">
              · Registrada por {{ detalhe.autor_apelido }}
            </template>
          </span>
        </section>

        <section
          v-if="detalhe.status_publico === 'RECUSADO'"
          class="fechada"
          data-teste="justificativa"
        >
          <span class="fa-sobrelinha">Motivo da recusa</span>
          <p>{{ detalhe.justificativa_recusa ?? 'A prefeitura não informou o motivo.' }}</p>
        </section>
        <section v-if="detalhe.status_publico === 'DUPLICADO'" class="fechada">
          <span class="fa-sobrelinha">Já havia um registro deste problema</span>
          <router-link
            v-if="detalhe.original"
            :to="`/ocorrencias/${detalhe.original.id}`"
            class="fa-link"
          >
            Acompanhar a ocorrência {{ detalhe.original.protocolo }}
          </router-link>
        </section>

        <section class="confirmacoes fa-card">
          <div class="confirmacoes__total">
            <q-icon name="sym_o_back_hand" size="20px" />
            <span data-teste="confirmacoes">{{ textoConfirmacoes }}</span>
          </div>
          <q-btn
            v-if="estadoBotao === 'CONFIRMAR' || estadoBotao === 'ENTRAR'"
            unelevated
            no-caps
            color="primary"
            icon="sym_o_back_hand"
            label="Também vi"
            class="fa-botao-largo"
            :loading="confirmando"
            :disable="confirmando"
            data-teste="tambem-vi"
            @click="tambemVi"
          />
          <div
            v-else-if="estadoBotao === 'CONFIRMADO'"
            class="confirmado"
            role="status"
            data-teste="voce-confirmou"
          >
            <q-icon name="sym_o_check_circle" size="20px" />
            Você confirmou
          </div>
          <p v-if="estadoBotao === 'ENTRAR'" class="fa-legenda">
            Entre na sua conta para confirmar que também viu o problema.
          </p>
          <p v-if="avisoConfirmacao" class="fa-mensagem fa-mensagem--erro" role="alert">
            {{ avisoConfirmacao }}
          </p>

          <div v-if="podeAvaliar || podeReabrir" class="pos-resolucao" data-teste="pos-resolucao">
            <q-btn
              v-if="podeAvaliar"
              unelevated
              no-caps
              color="primary"
              icon="sym_o_star"
              label="Avaliar atendimento"
              class="fa-botao-largo"
              data-teste="avaliar"
              @click="abrirAvaliacao"
            />
            <q-btn
              v-if="podeReabrir"
              outline
              no-caps
              color="primary"
              icon="sym_o_replay"
              label="Não foi resolvido"
              class="fa-botao-largo"
              data-teste="reabrir"
              @click="abrirReabertura"
            />
            <p v-if="textoPrazo" class="fa-legenda pos-resolucao__prazo" data-teste="prazo">
              <q-icon name="sym_o_schedule" size="16px" />
              {{ textoPrazo }}
            </p>
          </div>
          <p v-if="avisoPosResolucao" class="aviso" role="status" data-teste="aviso-pos-resolucao">
            {{ avisoPosResolucao }}
          </p>
          <p
            v-if="erroPosResolucao"
            class="fa-mensagem fa-mensagem--erro"
            role="alert"
            data-teste="erro-pos-resolucao"
          >
            {{ erroPosResolucao }}
          </p>
        </section>

        <section class="secao" aria-labelledby="titulo-linha">
          <h2 id="titulo-linha" class="fa-sobrelinha">Andamento</h2>
          <ol class="linha">
            <li
              v-for="(passo, indice) in passos"
              :key="`${passo.etapa}-${indice}`"
              class="linha__passo"
              :class="{ 'linha__passo--pendente': !passo.data }"
            >
              <span class="linha__ponto" aria-hidden="true" />
              <div class="linha__texto">
                <strong>{{ passo.rotulo }}</strong>
                <span class="fa-legenda">{{
                  passo.data ? dataCurta(passo.data) : 'Ainda não'
                }}</span>
                <p v-if="passo.observacao" class="linha__observacao">“{{ passo.observacao }}”</p>
              </div>
            </li>
          </ol>
        </section>

        <section class="secao" aria-labelledby="titulo-respostas">
          <h2 id="titulo-respostas" class="fa-sobrelinha">Resposta da prefeitura</h2>
          <p v-if="detalhe.respostas.length === 0" class="fa-legenda">
            A prefeitura ainda não respondeu.
          </p>
          <article
            v-for="(resposta, indice) in detalhe.respostas"
            :key="indice"
            class="resposta fa-card"
          >
            <div class="resposta__topo">
              <strong>{{ resposta.orgao }}</strong>
              <span class="fa-legenda">{{ dataCurta(resposta.data) }}</span>
            </div>
            <p>{{ resposta.comentario }}</p>
          </article>
        </section>
      </template>
    </div>

    <q-dialog v-model="avaliacaoAberta" position="bottom" :persistent="avaliando">
      <q-card class="formulario" data-teste="dialogo-avaliacao">
        <h2 id="titulo-avaliacao" class="formulario__titulo">Avaliar atendimento</h2>
        <p class="formulario__texto">
          Como foi a solução da prefeitura para este problema? A avaliação entra no score do órgão.
        </p>
        <div
          class="estrelas"
          role="radiogroup"
          aria-labelledby="titulo-avaliacao"
          data-teste="estrelas"
        >
          <button
            v-for="valor in estrelas"
            :key="valor"
            type="button"
            role="radio"
            class="estrelas__item"
            :class="{ 'estrelas__item--ativa': nota !== null && valor <= nota }"
            :aria-checked="nota === valor"
            :aria-label="rotuloEstrela(valor)"
            :disabled="avaliando"
            :data-teste="`estrela-${valor}`"
            @click="nota = valor"
          >
            <q-icon name="sym_o_star" size="36px" />
          </button>
        </div>
        <p
          v-if="problemasAvaliacao.nota"
          class="fa-mensagem fa-mensagem--erro"
          role="alert"
          data-teste="erro-nota"
        >
          {{ problemasAvaliacao.nota }}
        </p>
        <span v-else class="fa-legenda estrelas__legenda" aria-live="polite">
          {{ nota ? `Sua nota: ${rotuloEstrela(nota)}` : 'Toque nas estrelas para dar uma nota.' }}
        </span>
        <q-input
          v-model="comentario"
          type="textarea"
          autogrow
          outlined
          counter
          :maxlength="COMENTARIO_AVALIACAO_MAX"
          label="Comentário (opcional)"
          :disable="avaliando"
          :error="!!problemaComentario"
          :error-message="problemaComentario ?? undefined"
          data-teste="comentario-avaliacao"
        />
        <p v-if="erroAvaliacao" class="fa-mensagem fa-mensagem--erro" role="alert">
          {{ erroAvaliacao }}
        </p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          class="fa-botao-largo"
          label="Enviar avaliação"
          :loading="avaliando"
          data-teste="confirmar-avaliacao"
          @click="enviarAvaliacao"
        />
        <q-btn
          flat
          no-caps
          class="fa-botao-largo"
          label="Cancelar"
          :disable="avaliando"
          @click="avaliacaoAberta = false"
        />
      </q-card>
    </q-dialog>

    <q-dialog v-model="reaberturaAberta" position="bottom" :persistent="reabrindo">
      <q-card class="formulario" data-teste="dialogo-reabertura">
        <h2 class="formulario__titulo">Não foi resolvido</h2>
        <p class="formulario__texto">
          A ocorrência volta para a análise da prefeitura, e quem acompanha é avisado. Conte o que
          ainda está errado.
        </p>
        <q-input
          v-model="justificativa"
          type="textarea"
          autogrow
          outlined
          autofocus
          counter
          :maxlength="JUSTIFICATIVA_REABERTURA_MAX"
          label="Justificativa"
          hint="De 10 a 500 caracteres. Fica visível no andamento da ocorrência."
          :disable="reabrindo"
          :error="!!problemaJustificativa"
          :error-message="problemaJustificativa ?? undefined"
          data-teste="justificativa-reabertura"
        />
        <p v-if="erroReabertura" class="fa-mensagem fa-mensagem--erro" role="alert">
          {{ erroReabertura }}
        </p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          class="fa-botao-largo"
          label="Reabrir ocorrência"
          :loading="reabrindo"
          data-teste="confirmar-reabertura"
          @click="enviarReabertura"
        />
        <q-btn
          flat
          no-caps
          class="fa-botao-largo"
          label="Cancelar"
          :disable="reabrindo"
          @click="reaberturaAberta = false"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped lang="scss">
.topo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 0 4px;
}

.topo__titulo {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.carregando {
  display: flex;
  justify-content: center;
  padding: var(--fa-secao);
  color: var(--fa-azul);
}

.secao {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h2,
  p {
    margin: 0;
  }
}

.aviso {
  margin: 0;
  padding: 12px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-azul-suave);
  color: var(--fa-texto);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.fotos {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  margin: 0 calc(var(--fa-pagina) * -1);
  padding: 0 var(--fa-pagina);
}

.fotos__item {
  flex: 0 0 100%;
  scroll-snap-align: center;
  aspect-ratio: 4 / 3;
  border-radius: var(--fa-raio-lg);
  overflow: hidden;
  background: var(--fa-superficie-2);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.sem-foto {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  aspect-ratio: 16 / 9;
  border-radius: var(--fa-raio-lg);
  background: var(--fa-superficie-2);
  color: var(--fa-texto-3);
}

.resumo {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.resumo__selos {
  display: flex;
  gap: 8px;
  align-items: center;
}

.urgente {
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-urgente);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 20px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.resumo__descricao {
  margin: 0;
  font-size: 16px;
  line-height: 1.45;
  white-space: pre-line;
}

.resumo__linha {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  color: var(--fa-texto-2);
  font-size: 13px;

  .q-icon {
    margin-top: 2px;
    flex-shrink: 0;
  }
}

.atributos {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 4px 0;
  font-size: 13px;

  dt {
    color: var(--fa-texto-3);
  }

  dd {
    margin: 0;
  }
}

.fechada {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-superficie-2);

  p {
    margin: 0;
    color: var(--fa-texto-2);
    white-space: pre-line;
  }
}

.confirmacoes {
  display: flex;
  flex-direction: column;
  gap: 12px;

  p {
    margin: 0;
  }
}

.confirmacoes__total {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.confirmado {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-resolvido-fundo);
  color: var(--fa-resolvido-texto);
  font-weight: 600;
}

.linha {
  list-style: none;
  margin: 0;
  padding: 0;
}

.linha__passo {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 16px;

  // O traço que liga um ponto ao próximo.
  &:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 14px;
    bottom: 0;
    width: 2px;
    background: var(--fa-borda);
  }
}

.linha__ponto {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--fa-azul);
}

.linha__passo--pendente {
  .linha__ponto {
    background: var(--fa-superficie);
    border: 2px solid var(--fa-borda-forte);
  }

  strong {
    color: var(--fa-texto-3);
    font-weight: 500;
  }
}

.linha__texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.linha__observacao {
  margin: 4px 0 0;
  color: var(--fa-texto-2);
  font-size: 13px;
}

.resposta {
  display: flex;
  flex-direction: column;
  gap: 8px;

  p {
    margin: 0;
    white-space: pre-line;
  }
}

.resposta__topo {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.pos-resolucao {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--fa-borda);
}

.pos-resolucao__prazo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.formulario {
  width: 100%;
  max-width: 560px;
  padding: var(--fa-card);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--fa-superficie);
  border-radius: var(--fa-raio-lg) var(--fa-raio-lg) 0 0;

  p {
    margin: 0;
  }
}

.formulario__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.formulario__texto {
  font-size: 13px;
  color: var(--fa-texto-2);
}

.estrelas {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.estrelas__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--fa-borda-forte);
  cursor: pointer;
  transition: color 0.15s;

  &:focus-visible {
    outline: 2px solid var(--fa-azul);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
  }
}

// Estrela preenchida: o ícone com preenchimento e a cor âmbar dos selos.
.estrelas__item--ativa {
  color: var(--fa-recebido-texto);

  .q-icon {
    font-variation-settings: 'FILL' 1;
  }
}

.estrelas__legenda {
  text-align: center;
}
</style>
