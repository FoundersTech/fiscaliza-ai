<script setup lang="ts">
import { computed, onMounted } from 'vue';

import { useApi } from '@/boot/api';
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
import EstadoVazio from '@/components/EstadoVazio.vue';
import CartaoPendente from '@/components/pendentes/CartaoPendente.vue';
import { usePendentesStore } from '@/stores/pendentes';

const api = useApi();
const pendentes = usePendentesStore();

const vazia = computed(() => pendentes.quantidade === 0 && pendentes.enviadas.length === 0);

// Abrir a tela é mais uma chance de enviar o que está guardado.
onMounted(() => void pendentes.sincronizar(api));
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

      <section v-if="pendentes.enviadas.length > 0" class="secao" aria-labelledby="titulo-enviadas">
        <h2 id="titulo-enviadas" class="fa-sobrelinha">Enviadas agora</h2>
        <article
          v-for="enviada in pendentes.enviadas"
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

      <!-- As ocorrências que já estão no servidor entram aqui. -->

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
</style>
