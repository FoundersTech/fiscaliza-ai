<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useApi } from '@/boot/api';
import SeloReaberta from '@/components/atendimento/SeloReaberta.vue';
import SeloStatus from '@/components/atendimento/SeloStatus.vue';
import TopoAtendimento from '@/components/atendimento/TopoAtendimento.vue';
import {
  type Acao,
  acoesPermitidas,
  COMENTARIO_MAX,
  formatarDataHora,
  problemaDoCampo,
  ROTULO_CAMPO,
  tituloDoEvento,
} from '@/services/atendimento';
import { useAtendimentoStore } from '@/stores/atendimento';
import { useConfigStore } from '@/stores/config';

const rota = useRoute();
const api = useApi();
const atendimento = useAtendimentoStore();
const config = useConfigStore();

const id = computed(() => String(rota.params['id']));
const detalhe = computed(() => atendimento.detalhe);
const acoes = computed(() => (detalhe.value ? acoesPermitidas(detalhe.value) : []));
/** Os campos extras com o rótulo da categoria; sem a categoria carregada, o nome do campo. */
const atributos = computed(() => {
  const campos =
    config.categorias.find((categoria) => categoria.slug === detalhe.value?.categoria.slug)
      ?.schema_atributos ?? [];
  return Object.entries(detalhe.value?.atributos ?? {}).map(([chave, conteudo]) => ({
    chave,
    rotulo: campos.find((campo) => campo.chave === chave)?.rotulo ?? chave.replaceAll('_', ' '),
    conteudo,
  }));
});

function contagem(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`;
}

const erroAcao = ref<string | null>(null);
/** A ação que pede um dado (resposta, justificativa ou protocolo) abre o formulário. */
const acaoAberta = ref<Acao | null>(null);
const valor = ref('');
const tentouEnviar = ref(false);
const formularioAberto = computed({
  get: () => acaoAberta.value !== null,
  set: (aberto) => {
    if (!aberto) acaoAberta.value = null;
  },
});
const problema = computed(() =>
  tentouEnviar.value ? problemaDoCampo(acaoAberta.value?.campo ?? null, valor.value) : null,
);

watch(id, (novo) => void atendimento.abrirDetalhe(api, novo), { immediate: true });
void config.carregar(api);

function escolher(acao: Acao): void {
  erroAcao.value = null;
  if (!acao.campo) {
    void executar(acao);
    return;
  }
  valor.value = '';
  tentouEnviar.value = false;
  acaoAberta.value = acao;
}

async function executar(acao: Acao, dado?: string): Promise<void> {
  const resultado = await atendimento.executar(api, acao.para, dado);
  if (resultado?.tipo === 'ERRO') {
    erroAcao.value = resultado.mensagem;
    return;
  }
  acaoAberta.value = null;
}

function confirmar(): void {
  const acao = acaoAberta.value;
  if (!acao) return;
  tentouEnviar.value = true;
  if (problemaDoCampo(acao.campo, valor.value)) return;
  void executar(acao, valor.value);
}
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <TopoAtendimento
      :titulo="detalhe?.protocolo ?? 'Ocorrência'"
      subtitulo="Atendimento"
      voltar-para="/atendimento"
      rotulo-voltar="Voltar à fila"
    />

    <q-page-container>
      <q-page>
        <div class="fa-conteudo detalhe">
          <p v-if="atendimento.aviso" class="aviso" role="status">
            <q-icon name="sym_o_sync" size="18px" />
            {{ atendimento.aviso }}
          </p>

          <p v-if="atendimento.erroDetalhe" class="fa-mensagem fa-mensagem--erro" role="alert">
            {{ atendimento.erroDetalhe }}
          </p>

          <div v-if="!detalhe && atendimento.carregandoDetalhe" class="detalhe__carregando">
            <q-spinner size="28px" color="primary" />
          </div>

          <template v-if="detalhe">
            <section class="fa-card bloco">
              <div class="bloco__selos">
                <SeloStatus :status="detalhe.status" />
                <SeloReaberta v-if="detalhe.reaberta" />
                <span v-if="detalhe.urgente" class="urgente">Urgente</span>
              </div>
              <span class="linha">
                <q-icon :name="`sym_o_${detalhe.categoria.icone}`" size="18px" />
                {{ detalhe.categoria.nome }}
              </span>
              <span class="linha">
                <q-icon name="sym_o_location_on" size="18px" />
                {{ detalhe.endereco ?? 'Endereço ainda não identificado' }}
              </span>
              <span class="fa-legenda">
                Registrada em {{ formatarDataHora(detalhe.criada_em) }} ·
                {{ contagem(detalhe.dias_em_aberto, 'dia', 'dias') }} em aberto ·
                {{ contagem(detalhe.confirmacoes, 'confirmação', 'confirmações') }}
              </span>
              <p class="detalhe__descricao">{{ detalhe.descricao }}</p>
              <dl v-if="atributos.length" class="atributos">
                <template v-for="atributo in atributos" :key="atributo.chave">
                  <dt>{{ atributo.rotulo }}</dt>
                  <dd>{{ atributo.conteudo }}</dd>
                </template>
              </dl>
              <div v-if="detalhe.fotos.length" class="fotos">
                <a
                  v-for="(foto, indice) in detalhe.fotos"
                  :key="foto.url"
                  :href="foto.url"
                  target="_blank"
                  rel="noopener"
                >
                  <img
                    :src="foto.miniatura_url ?? foto.url"
                    :alt="`Foto ${indice + 1} da ocorrência`"
                  />
                </a>
              </div>
              <span v-else-if="detalhe.foto_em_analise" class="fa-legenda">Foto em análise</span>
            </section>

            <section class="fa-card bloco" aria-labelledby="titulo-acoes">
              <h2 id="titulo-acoes" class="bloco__titulo">Ações</h2>
              <p v-if="!acoes.length" class="fa-legenda">
                Esta ocorrência está encerrada: não há mais mudanças de status.
              </p>
              <div v-else class="acoes">
                <q-btn
                  v-for="(acao, indice) in acoes"
                  :key="acao.para"
                  no-caps
                  unelevated
                  :outline="indice > 0"
                  color="primary"
                  :label="acao.rotulo"
                  :loading="atendimento.executando && !acaoAberta"
                  :disable="atendimento.executando || atendimento.carregandoDetalhe"
                  class="acoes__botao"
                  @click="escolher(acao)"
                />
              </div>
              <p v-if="erroAcao && !acaoAberta" class="fa-mensagem fa-mensagem--erro" role="alert">
                {{ erroAcao }}
              </p>
            </section>

            <section class="fa-card bloco" aria-labelledby="titulo-eventos">
              <h2 id="titulo-eventos" class="bloco__titulo">Histórico</h2>
              <ol class="eventos">
                <li v-for="(evento, indice) in detalhe.eventos" :key="indice" class="evento">
                  <strong>{{ tituloDoEvento(evento) }}</strong>
                  <span class="fa-legenda">
                    {{ formatarDataHora(evento.criado_em) }}
                    <template v-if="evento.orgao"> · {{ evento.orgao }}</template>
                  </span>
                  <p v-if="evento.comentario" class="evento__comentario">
                    {{ evento.comentario }}
                  </p>
                </li>
              </ol>
            </section>
          </template>
        </div>
      </q-page>
    </q-page-container>

    <q-dialog v-model="formularioAberto" position="bottom" :persistent="atendimento.executando">
      <q-card v-if="acaoAberta" class="formulario">
        <h2 class="formulario__titulo">{{ acaoAberta.rotulo }}</h2>
        <q-input
          v-if="acaoAberta.campo === 'protocolo'"
          v-model="valor"
          outlined
          autofocus
          :label="ROTULO_CAMPO.protocolo"
          placeholder="FA-2026-SOR-000123"
          :error="!!problema"
          :error-message="problema ?? undefined"
          @keyup.enter="confirmar"
        />
        <q-input
          v-else-if="acaoAberta.campo"
          v-model="valor"
          type="textarea"
          autogrow
          outlined
          autofocus
          counter
          :maxlength="COMENTARIO_MAX"
          :label="ROTULO_CAMPO[acaoAberta.campo]"
          :hint="
            acaoAberta.campo === 'resposta'
              ? 'O cidadão vê esta resposta na ocorrência.'
              : 'O autor vê esta justificativa.'
          "
          :error="!!problema"
          :error-message="problema ?? undefined"
        />
        <p v-if="erroAcao" class="fa-mensagem fa-mensagem--erro" role="alert">{{ erroAcao }}</p>
        <q-btn
          unelevated
          no-caps
          color="primary"
          class="fa-botao-largo"
          :label="acaoAberta.rotulo"
          :loading="atendimento.executando"
          @click="confirmar"
        />
        <q-btn
          flat
          no-caps
          class="fa-botao-largo"
          label="Cancelar"
          :disable="atendimento.executando"
          @click="acaoAberta = null"
        />
      </q-card>
    </q-dialog>
  </q-layout>
</template>

<style scoped lang="scss">
.detalhe {
  padding-top: var(--fa-pagina);
}

.detalhe__carregando {
  display: flex;
  justify-content: center;
  padding: var(--fa-secao);
}

.aviso {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-recebido-fundo);
  color: var(--fa-recebido-texto);
  font-weight: 500;
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bloco__selos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.bloco__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.urgente {
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--fa-urgente);
}

.linha {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fa-texto-2);
}

.detalhe__descricao {
  margin: 4px 0 0;
  white-space: pre-line;
}

.atributos {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;

  dt {
    color: var(--fa-texto-3);
  }

  dd {
    margin: 0;
  }
}

.fotos {
  display: flex;
  gap: 8px;

  img {
    width: 120px;
    height: 120px;
    object-fit: cover;
    border-radius: var(--fa-raio);
    display: block;
  }
}

.acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.acoes__botao {
  flex: 1 1 160px;
  min-height: 44px;
  border-radius: var(--fa-raio-sm);
  font-weight: 600;
}

.eventos {
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 2px solid var(--fa-borda);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.evento {
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    left: -22px;
    top: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--fa-azul);
  }
}

.evento__comentario {
  margin: 4px 0 0;
  padding: 8px 12px;
  border-radius: var(--fa-raio-sm);
  background: var(--fa-superficie-2);
  white-space: pre-line;
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
}

.formulario__titulo {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
</style>
