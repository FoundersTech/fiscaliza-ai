<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import {
  barrasPorCategoria,
  formatarAtualizacao,
  formatarDias,
  formatarNumero,
  formatarPercentual,
  PERIODOS,
  SEM_OCORRENCIAS,
} from '@/services/painel';
import { useConfigStore } from '@/stores/config';
import { usePainelStore } from '@/stores/painel';

const api = useApi();
const config = useConfigStore();
const painel = usePainelStore();

const dados = computed(() => painel.painel);
const barras = computed(() => barrasPorCategoria(dados.value?.por_categoria ?? []));

onMounted(async () => {
  // A cidade escolhida vem da configuração; sem ela, o painel soma todas as atendidas.
  await config.carregar(api);
  await painel.carregar(api);
});

watch(
  () => config.municipio?.id,
  (nova, antiga) => {
    if (antiga !== undefined && nova !== antiga) void painel.carregar(api);
  },
);
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Painel de indicadores" com-local />

      <section class="filtros" aria-label="Filtros">
        <div class="periodos" role="radiogroup" aria-label="Período">
          <button
            v-for="opcao in PERIODOS"
            :key="opcao.dias"
            type="button"
            role="radio"
            class="periodos__opcao"
            :class="{ 'periodos__opcao--ativa': painel.periodo === opcao.dias }"
            :aria-checked="painel.periodo === opcao.dias"
            @click="painel.escolherPeriodo(api, opcao.dias)"
          >
            {{ opcao.rotulo }}
          </button>
        </div>

        <div v-if="config.categorias.length" class="categorias" aria-label="Categorias">
          <button
            type="button"
            class="categorias__chip"
            :class="{ 'categorias__chip--ativa': !painel.categorias.length }"
            :aria-pressed="!painel.categorias.length"
            @click="painel.todasCategorias(api)"
          >
            Todas
          </button>
          <button
            v-for="categoria in config.categorias"
            :key="categoria.slug"
            type="button"
            class="categorias__chip"
            :class="{ 'categorias__chip--ativa': painel.categorias.includes(categoria.slug) }"
            :aria-pressed="painel.categorias.includes(categoria.slug)"
            @click="painel.alternarCategoria(api, categoria.slug)"
          >
            <q-icon :name="`sym_o_${categoria.icone}`" size="18px" />
            {{ categoria.nome }}
          </button>
        </div>
      </section>

      <div v-if="painel.carregando && !dados" class="estado">
        <q-spinner size="28px" color="primary" />
      </div>

      <div v-else-if="painel.erro" class="estado">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ painel.erro }}</p>
        <q-btn flat no-caps color="primary" label="Tentar de novo" @click="painel.carregar(api)" />
      </div>

      <div
        v-else-if="dados"
        class="resultado"
        :class="{ 'resultado--atualizando': painel.carregando }"
        :aria-busy="painel.carregando"
      >
        <EstadoVazio
          v-if="dados.vazio"
          icone="sym_o_bar_chart"
          :titulo="SEM_OCORRENCIAS"
          texto="Experimente um período maior ou outras categorias."
        />

        <template v-else>
          <div class="indicadores">
            <div class="fa-card indicador">
              <span class="indicador__valor">{{ formatarNumero(dados.total) }}</span>
              <span class="fa-legenda">ocorrências</span>
            </div>
            <div class="fa-card indicador">
              <span class="indicador__valor">{{ formatarPercentual(dados.resolvidas_pct) }}</span>
              <span class="fa-legenda"> resolvidas ({{ formatarNumero(dados.resolvidas) }}) </span>
            </div>
            <div class="fa-card indicador indicador--largo">
              <span class="indicador__valor">{{ formatarDias(dados.dias_mediana) }}</span>
              <span class="fa-legenda">
                {{
                  dados.dias_mediana === null
                    ? 'nenhuma resolvida no período'
                    : 'mediana entre o registro e a resolução'
                }}
              </span>
            </div>
          </div>

          <section class="fa-card categorias-painel" aria-labelledby="titulo-por-categoria">
            <div class="categorias-painel__topo">
              <h2 id="titulo-por-categoria" class="categorias-painel__titulo">Por categoria</h2>
              <div class="legenda" aria-hidden="true">
                <span class="legenda__item">
                  <span class="legenda__cor legenda__cor--resolvidas" />
                  resolvidas
                </span>
                <span class="legenda__item">
                  <span class="legenda__cor" />
                  não resolvidas
                </span>
              </div>
            </div>

            <ul class="barras">
              <li v-for="barra in barras" :key="barra.slug" class="barra-categoria">
                <div class="barra-categoria__rotulo">
                  <q-icon :name="`sym_o_${barra.icone}`" size="18px" />
                  <span class="barra-categoria__nome">{{ barra.nome }}</span>
                  <span class="barra-categoria__total">{{ formatarNumero(barra.total) }}</span>
                </div>
                <div
                  class="barra-categoria__trilho"
                  role="img"
                  :aria-label="`${barra.nome}: ${barra.total} ocorrências, ${barra.resolvidas} resolvidas`"
                >
                  <div class="barra-categoria__barra" :style="{ width: `${barra.largura}%` }">
                    <div
                      class="barra-categoria__resolvidas"
                      :style="{ width: `${barra.resolvidasLargura}%` }"
                    />
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </template>

        <p class="fa-legenda atualizacao">{{ formatarAtualizacao(dados.calculado_em) }}</p>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.filtros {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.periodos {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 4px;
  border-radius: var(--fa-raio);
  background: var(--fa-superficie-2);
}

.periodos__opcao {
  height: 36px;
  border: 0;
  border-radius: var(--fa-raio-sm);
  background: transparent;
  color: var(--fa-texto-2);
  font: inherit;
  font-weight: 500;
  cursor: pointer;

  &--ativa {
    background: var(--fa-superficie);
    color: var(--fa-azul);
    font-weight: 600;
    box-shadow: var(--fa-sombra);
  }
}

// Chips roláveis na horizontal, sem quebrar a linha no celular.
.categorias {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 calc(var(--fa-pagina) * -1);
  padding: 0 var(--fa-pagina) 4px;
  scrollbar-width: none;
}

.categorias__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--fa-borda);
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie);
  color: var(--fa-texto-2);
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;

  &--ativa {
    border-color: var(--fa-azul);
    background: var(--fa-azul-suave);
    color: var(--fa-azul);
  }
}

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

  &--largo {
    grid-column: 1 / -1;
  }
}

.indicador__valor {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
}

.categorias-painel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.categorias-painel__topo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.categorias-painel__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.legenda {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--fa-texto-3);
}

.legenda__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legenda__cor {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--fa-borda-forte);

  &--resolvidas {
    background: var(--fa-azul);
  }
}

.barras {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.barra-categoria {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.barra-categoria__rotulo {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fa-texto-2);
}

.barra-categoria__nome {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fa-texto);
  font-weight: 500;
}

.barra-categoria__total {
  font-weight: 600;
  color: var(--fa-texto);
  font-variant-numeric: tabular-nums;
}

.barra-categoria__trilho {
  height: 10px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie-2);
  overflow: hidden;
}

.barra-categoria__barra {
  height: 100%;
  min-width: 4px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-borda-forte);
  overflow: hidden;
}

.barra-categoria__resolvidas {
  height: 100%;
  background: var(--fa-azul);
}

.atualizacao {
  margin: 0;
  text-align: center;
}
</style>
