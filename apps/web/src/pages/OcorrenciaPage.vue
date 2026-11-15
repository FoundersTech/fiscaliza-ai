<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useApi } from '@/boot/api';
import EstadoVazio from '@/components/EstadoVazio.vue';
import SeloStatus from '@/components/ocorrencia/SeloStatus.vue';
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
  if (window.history.state?.back) router.back();
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

          <!--
            Avaliar o atendimento e "Não foi resolvido" entram aqui: aparecem para o autor e para
            quem confirmou (detalhe.pode_avaliar e detalhe.pode_reabrir), até
            detalhe.prazo_pos_resolucao_ate.
          -->
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
</style>
