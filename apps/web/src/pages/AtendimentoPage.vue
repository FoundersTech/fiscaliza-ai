<script setup lang="ts">
import { onMounted } from 'vue';

import { useApi } from '@/boot/api';
import SeloReaberta from '@/components/atendimento/SeloReaberta.vue';
import SeloStatus from '@/components/atendimento/SeloStatus.vue';
import TopoAtendimento from '@/components/atendimento/TopoAtendimento.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import { ROTULO_STATUS, type StatusInterno, TODOS_STATUS } from '@/services/atendimento';
import { useAtendimentoStore } from '@/stores/atendimento';
import { useConfigStore } from '@/stores/config';

const api = useApi();
const atendimento = useAtendimentoStore();
const config = useConfigStore();

function alternarStatus(status: StatusInterno): void {
  atendimento.alternarStatus(status);
  void atendimento.carregarFila(api);
}

function alternarCategoria(slug: string): void {
  atendimento.alternarCategoria(slug);
  void atendimento.carregarFila(api);
}

function dias(total: number): string {
  return total === 1 ? '1 dia' : `${total} dias`;
}

// Volta do detalhe sempre com a fila atualizada: o status pode ter mudado lá.
onMounted(() => {
  void atendimento.carregarFila(api);
  void config.carregar(api);
});
</script>

<template>
  <q-layout view="hHh lpR fFf">
    <TopoAtendimento
      titulo="Fila de atendimento"
      subtitulo="Da mais antiga para a mais recente"
      voltar-para="/"
      rotulo-voltar="Voltar ao início"
    />

    <q-page-container>
      <q-page>
        <div class="fa-conteudo fila">
          <section class="filtros" aria-label="Filtros">
            <div class="filtros__grupo" role="group" aria-label="Status">
              <button
                v-for="status in TODOS_STATUS"
                :key="status"
                type="button"
                class="filtro"
                :aria-pressed="atendimento.filtros.status.includes(status)"
                @click="alternarStatus(status)"
              >
                {{ ROTULO_STATUS[status] }}
              </button>
            </div>
            <div
              v-if="config.categorias.length"
              class="filtros__grupo"
              role="group"
              aria-label="Categoria"
            >
              <button
                v-for="categoria in config.categorias"
                :key="categoria.slug"
                type="button"
                class="filtro"
                :aria-pressed="atendimento.filtros.categorias.includes(categoria.slug)"
                @click="alternarCategoria(categoria.slug)"
              >
                <q-icon :name="`sym_o_${categoria.icone}`" size="16px" />
                {{ categoria.nome }}
              </button>
            </div>
          </section>

          <p v-if="atendimento.erroFila" class="fa-mensagem fa-mensagem--erro" role="alert">
            {{ atendimento.erroFila }}
          </p>

          <ul v-if="atendimento.itens.length" class="lista">
            <li v-for="item in atendimento.itens" :key="item.id">
              <router-link :to="`/atendimento/${item.id}`" class="cartao fa-card">
                <div class="cartao__topo">
                  <span class="fa-sobrelinha">{{ item.protocolo }}</span>
                  <span class="cartao__selos">
                    <SeloReaberta v-if="item.reaberta" />
                    <SeloStatus :status="item.status" />
                  </span>
                </div>
                <strong class="cartao__resumo">{{ item.resumo }}</strong>
                <span class="cartao__linha">
                  <q-icon :name="`sym_o_${item.categoria.icone}`" size="16px" />
                  {{ item.categoria.nome }}
                </span>
                <span v-if="item.endereco" class="cartao__linha">
                  <q-icon name="sym_o_location_on" size="16px" />
                  {{ item.endereco }}
                </span>
                <span class="fa-legenda">
                  {{ dias(item.dias_em_aberto) }} em aberto
                  <template v-if="item.confirmacoes">
                    · {{ item.confirmacoes }} também viram</template
                  >
                  <strong v-if="item.urgente" class="cartao__urgente"> · Urgente</strong>
                </span>
              </router-link>
            </li>
          </ul>

          <EstadoVazio
            v-else-if="!atendimento.carregandoFila && !atendimento.erroFila"
            icone="sym_o_inbox"
            titulo="Nenhuma ocorrência nesta fila"
            texto="Mude os filtros para ver as ocorrências em outros status ou categorias."
          />

          <div v-if="atendimento.carregandoFila" class="fila__carregando">
            <q-spinner size="28px" color="primary" />
          </div>
          <q-btn
            v-else-if="atendimento.proximoCursor"
            outline
            no-caps
            color="primary"
            class="fa-botao-largo"
            label="Carregar mais"
            @click="atendimento.carregarMais(api)"
          />
        </div>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style scoped lang="scss">
.fila {
  padding-top: var(--fa-pagina);
}

.filtros {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filtros__grupo {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filtro {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--fa-borda-forte);
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-superficie);
  color: var(--fa-texto-2);
  font: inherit;
  font-size: 13px;
  cursor: pointer;

  &[aria-pressed='true'] {
    border-color: var(--fa-azul);
    background: var(--fa-azul-suave);
    color: var(--fa-azul);
    font-weight: 600;
  }
}

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cartao {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  color: inherit;
  text-decoration: none;
}

.cartao__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.cartao__selos {
  display: flex;
  gap: 6px;
}

.cartao__resumo {
  font-size: 15px;
  font-weight: 600;
}

.cartao__linha {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--fa-texto-2);
}

.cartao__urgente {
  color: var(--fa-urgente);
}

.fila__carregando {
  display: flex;
  justify-content: center;
  padding: var(--fa-pagina);
}
</style>
