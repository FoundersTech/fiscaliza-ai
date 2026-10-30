<script setup lang="ts">
import CabecalhoPagina from '@/components/CabecalhoPagina.vue';
</script>

<template>
  <q-page>
    <div class="fa-conteudo">
      <CabecalhoPagina titulo="Reputação da gestão" subtitulo="Prefeitura de Sorocaba" />

      <section class="nota fa-card" aria-label="Nota da gestão">
        <div class="nota__anel">
          <span class="nota__valor">–</span>
          <span class="fa-legenda">de 10</span>
        </div>
        <strong class="nota__classificacao">Sem dados suficientes</strong>
        <p class="nota__texto">
          A nota combina a taxa de resolução, o cumprimento dos prazos e a avaliação dos cidadãos.
        </p>
      </section>

      <div class="indicadores">
        <div class="fa-card indicador">
          <span class="indicador__valor">–</span>
          <span class="fa-legenda">resolvidas</span>
        </div>
        <div class="fa-card indicador">
          <span class="indicador__valor">–</span>
          <span class="fa-legenda">tempo médio de resposta</span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<style scoped lang="scss">
.nota {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.nota__anel {
  display: grid;
  place-items: center;
  align-content: center;
  width: 120px;
  height: 120px;
  border-radius: var(--fa-raio-pilula);
  border: 10px solid var(--fa-superficie-2);
  margin-bottom: 4px;
}

.nota__valor {
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
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
}
</style>
