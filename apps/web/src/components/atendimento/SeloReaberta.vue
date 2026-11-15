<template>
  <span class="reaberta">
    <q-icon name="sym_o_replay" size="14px" />
    Reaberta
  </span>
</template>

<style scoped lang="scss">
// O cidadão disse que não foi resolvido: destaque em vermelho, como o selo de urgente.
.reaberta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: var(--fa-raio-pilula);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: color-mix(in srgb, var(--fa-urgente) 12%, transparent);
  color: var(--fa-urgente);
}
</style>
