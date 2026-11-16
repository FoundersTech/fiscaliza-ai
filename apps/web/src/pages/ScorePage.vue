<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import { formatarDias, formatarNumero, formatarPercentual } from '@/services/painel';
import {
  formatarDataAtualizacao,
  medidorScore,
  proporcaoCategoria,
  textoResolucaoCategoria,
} from '@/services/score';
import { useScoreStore } from '@/stores/score';

const api = useApi();
const loja = useScoreStore();

const dados = computed(() => loja.score);
const medidor = computed(() =>
  medidorScore(dados.value?.score ?? null, dados.value?.classificacao ?? null),
);
const janela = computed(() =>
  dados.value ? `nos últimos ${formatarNumero(dados.value.janela_dias)} dias` : '',
);
const categorias = computed(() =>
  (dados.value?.por_categoria ?? []).map((categoria) => ({
    ...categoria,
    texto: textoResolucaoCategoria(categoria.resolvidas, categoria.total),
    proporcao: proporcaoCategoria(categoria.resolvidas, categoria.total),
  })),
);

onMounted(() => {
  void loja.garantir(api);
});
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Reputação da gestão" subtitulo="Prefeitura de Sorocaba" />

      <div v-if="loja.carregando && !dados" class="estado">
        <q-spinner size="28px" color="primary" />
      </div>

      <div v-else-if="loja.erro" class="estado">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ loja.erro }}</p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="loja.carregar(api)" />
      </div>

      <div
        v-else-if="dados"
        class="resultado"
        :class="{ 'resultado--atualizando': loja.carregando }"
        :aria-busy="loja.carregando"
      >
        <section class="nota fa-card" aria-label="Nota da gestão">
          <div class="nota__medidor" role="img" :aria-label="medidor.descricao">
            <svg class="nota__anel" viewBox="0 0 120 120" aria-hidden="true">
              <circle class="nota__trilho" cx="60" cy="60" r="52" />
              <circle
                v-if="medidor.proporcao > 0"
                class="nota__progresso"
                cx="60"
                cy="60"
                r="52"
                pathLength="100"
                :stroke-dasharray="`${medidor.proporcao} 100`"
              />
            </svg>
            <div class="nota__centro" aria-hidden="true">
              <span class="nota__valor">{{ medidor.nota }}</span>
              <span class="fa-legenda">de 10</span>
            </div>
          </div>
          <strong class="nota__classificacao" aria-hidden="true">{{ medidor.rotulo }}</strong>
          <p class="nota__texto">
            A nota combina a taxa de resolução, o cumprimento dos prazos e a avaliação dos cidadãos
            {{ janela }}.
          </p>
        </section>

        <div class="indicadores">
          <div class="fa-card indicador">
            <span class="indicador__valor">{{ formatarPercentual(dados.resolvidas_pct) }}</span>
            <span class="fa-legenda">resolvidas {{ janela }}</span>
          </div>
          <div class="fa-card indicador">
            <span class="indicador__valor">{{ formatarDias(dados.dias_mediana) }}</span>
            <span class="fa-legenda">
              {{
                dados.dias_mediana === null
                  ? `nenhuma resolvida ${janela}`
                  : 'mediana de dias de atendimento'
              }}
            </span>
          </div>
        </div>

        <section class="fa-card categorias" aria-labelledby="titulo-por-categoria">
          <h2 id="titulo-por-categoria" class="categorias__titulo">Por categoria</h2>

          <ul v-if="categorias.length" class="barras">
            <li v-for="categoria in categorias" :key="categoria.categoria_id" class="barra">
              <div class="barra__rotulo">
                <span class="barra__nome">{{ categoria.nome }}</span>
                <span class="barra__texto">{{ categoria.texto }}</span>
              </div>
              <div
                class="barra__trilho"
                role="progressbar"
                :aria-label="`${categoria.nome}: ${categoria.texto} resolvidas`"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="categoria.proporcao"
              >
                <div class="barra__resolvidas" :style="{ width: `${categoria.proporcao}%` }" />
              </div>
            </li>
          </ul>

          <p v-else class="fa-legenda categorias__vazio">Nenhuma ocorrência {{ janela }}.</p>
        </section>

        <q-btn
          outline
          no-caps
          color="primary"
          class="painel"
          icon="sym_o_bar_chart"
          label="Ver painel completo"
          to="/painel"
        />

        <p class="fa-legenda atualizacao">{{ formatarDataAtualizacao(dados.calculado_em) }}</p>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.estado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: var(--fa-secao) 0;
}

.resultado {
  display: flex;
  flex-direction: column;
  gap: var(--fa-pagina);
  transition: opacity 0.15s;

  &--atualizando {
    opacity: 0.6;
  }
}

.nota {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.nota__medidor {
  position: relative;
  width: 132px;
  height: 132px;
  margin-bottom: 4px;
}

.nota__anel {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.nota__trilho,
.nota__progresso {
  fill: none;
  stroke-width: 10;
}

.nota__trilho {
  stroke: var(--fa-superficie-2);
}

.nota__progresso {
  stroke: var(--fa-azul);
  stroke-linecap: round;
  transition: stroke-dasharray 0.4s ease;
}

.nota__centro {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
}

.nota__valor {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.nota__classificacao {
  font-size: 16px;
  font-weight: 600;
}

.nota__texto {
  margin: 0;
  max-width: 36ch;
  color: var(--fa-texto-2);
}

.indicadores {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.indicador {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
}

.indicador__valor {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.categorias {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.categorias__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.categorias__vazio {
  margin: 0;
}

.barras {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.barra {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.barra__rotulo {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.barra__nome {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.barra__texto {
  flex-shrink: 0;
  color: var(--fa-texto-2);
  font-variant-numeric: tabular-nums;
}

.barra__trilho {
  height: 10px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie-2);
  overflow: hidden;
}

.barra__resolvidas {
  height: 100%;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-azul);
}

.painel {
  align-self: stretch;
}

.atualizacao {
  margin: 0;
  text-align: center;
}
</style>
