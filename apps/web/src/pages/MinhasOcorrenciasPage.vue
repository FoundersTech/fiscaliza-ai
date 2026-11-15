<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import CartaoMinhaOcorrencia from '@/components/ocorrencia/CartaoMinhaOcorrencia.vue';
import CartaoPendente from '@/components/pendentes/CartaoPendente.vue';
import { useMinhasOcorrenciasStore } from '@/stores/minhas-ocorrencias';
import { usePendentesStore } from '@/stores/pendentes';

const api = useApi();
const pendentes = usePendentesStore();
const minhas = useMinhasOcorrenciasStore();

// Uma pendente que acabou de subir aparece em "Enviadas agora" até a lista do servidor trazê-la.
const enviadasForaDaLista = computed(() => {
  const protocolos = new Set(minhas.itens.map((item) => item.protocolo));
  return pendentes.enviadas.filter((enviada) => !protocolos.has(enviada.protocolo));
});

const vazia = computed(
  () =>
    minhas.carregou &&
    minhas.itens.length === 0 &&
    pendentes.quantidade === 0 &&
    enviadasForaDaLista.value.length === 0,
);

onMounted(() => {
  // Abrir a tela é mais uma chance de enviar o que está guardado.
  void pendentes.sincronizar(api);
  void minhas.recarregar(api);
});

// Uma pendente chegou ao servidor: a lista passa a trazê-la com o status.
watch(
  () => pendentes.enviadas.length,
  () => void minhas.recarregar(api),
);

function aoChegarNoFim(_indice: number, pronto: (parar?: boolean) => void): void {
  void minhas.carregarMais(api).then(() => pronto(!minhas.temMais));
}

function tentarDeNovo(): void {
  void (minhas.carregou ? minhas.carregarMais(api) : minhas.recarregar(api));
}
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Minhas ocorrências" />

      <section v-if="pendentes.quantidade > 0" class="secao" aria-labelledby="titulo-pendentes">
        <h2 id="titulo-pendentes" class="fa-sobrelinha">Não enviadas</h2>
        <p class="fa-legenda">
          Ficam guardadas neste aparelho e são enviadas sozinhas quando houver conexão.
        </p>
        <CartaoPendente
          v-for="pendente in pendentes.lista"
          :key="pendente.chave"
          :pendente="pendente"
          @descartar="pendentes.descartar(pendente.chave)"
        />
      </section>

      <section
        v-if="enviadasForaDaLista.length > 0"
        class="secao"
        aria-labelledby="titulo-enviadas"
      >
        <h2 id="titulo-enviadas" class="fa-sobrelinha">Enviadas agora</h2>
        <article
          v-for="enviada in enviadasForaDaLista"
          :key="enviada.chave"
          class="enviada fa-card"
          role="status"
        >
          <strong>{{ enviada.categoriaNome }}</strong>
          <span class="enviada__descricao">{{ enviada.descricao }}</span>
          <span class="fa-legenda">
            Protocolo <strong data-teste="protocolo">{{ enviada.protocolo }}</strong>
          </span>
        </article>
      </section>

      <section v-if="minhas.itens.length > 0" class="secao" aria-labelledby="titulo-registradas">
        <h2 id="titulo-registradas" class="fa-sobrelinha">Registradas</h2>
        <q-infinite-scroll :offset="300" :disable="!minhas.temMais" @load="aoChegarNoFim">
          <div class="secao">
            <CartaoMinhaOcorrencia
              v-for="ocorrencia in minhas.itens"
              :key="ocorrencia.id"
              :ocorrencia="ocorrencia"
            />
          </div>
          <template #loading>
            <div class="carregando"><q-spinner size="24px" /></div>
          </template>
        </q-infinite-scroll>
      </section>

      <div v-if="minhas.carregando && !minhas.carregou" class="carregando">
        <q-spinner size="32px" />
      </div>

      <div v-if="minhas.erro" class="secao">
        <p class="fa-mensagem fa-mensagem--erro" role="alert">{{ minhas.erro }}</p>
        <q-btn
          flat
          no-caps
          color="primary"
          label="Tentar de novo"
          class="tentar"
          @click="tentarDeNovo"
        />
      </div>

      <EstadoVazio
        v-if="vazia"
        icone="sym_o_assignment"
        titulo="Nenhuma ocorrência ainda"
        texto="As ocorrências que você registrar aparecem aqui, com o protocolo e o status de cada uma."
      >
        <q-btn unelevated no-caps color="primary" label="Registrar ocorrência" to="/registrar" />
      </EstadoVazio>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.secao {
  display: flex;
  flex-direction: column;
  gap: 12px;

  h2,
  p {
    margin: 0;
  }
}

.enviada {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.enviada__descricao {
  color: var(--fa-texto-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.carregando {
  display: flex;
  justify-content: center;
  padding: var(--fa-pagina);
  color: var(--fa-azul);
}

.tentar {
  align-self: flex-start;
}
</style>
