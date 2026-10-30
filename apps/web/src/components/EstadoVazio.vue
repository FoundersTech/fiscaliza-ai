<script setup lang="ts">
defineProps<{ icone: string; titulo: string; texto: string }>();
</script>

<template>
  <section class="vazio">
    <div class="vazio__icone">
      <q-icon :name="icone" size="28px" />
    </div>
    <h2 class="vazio__titulo">{{ titulo }}</h2>
    <p class="vazio__texto">{{ texto }}</p>
    <slot />
  </section>
</template>

<style scoped lang="scss">
.vazio {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--fa-secao) var(--fa-card);
  gap: 8px;
}

.vazio__icone {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--fa-raio-pilula);
  background: var(--fa-azul-suave);
  color: var(--fa-azul);
  margin-bottom: 4px;
}

.vazio__titulo {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
}

.vazio__texto {
  margin: 0;
  max-width: 34ch;
  color: var(--fa-texto-2);
}
</style>
