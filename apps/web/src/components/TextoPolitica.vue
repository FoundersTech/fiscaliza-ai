<script setup lang="ts">
import { POLITICA_VERSAO } from '@/services/politica';
</script>

<template>
  <div class="politica">
    <p class="fa-sobrelinha">Versão {{ POLITICA_VERSAO }}</p>

    <h2>Quais dados usamos</h2>
    <p>
      Nome, apelido público e e-mail da sua conta; as ocorrências que você registra, com fotos,
      descrição e localização; e as confirmações e avaliações que você faz.
    </p>

    <h2>Para quê</h2>
    <p>
      Para mostrar os problemas da cidade, encaminhar cada um ao órgão responsável e avisar você
      quando o status mudar. Seu nome e seu e-mail não aparecem para outras pessoas, e o apelido só
      aparece se você quiser.
    </p>

    <h2>Seus direitos</h2>
    <p>
      Você pode pedir uma cópia dos seus dados e excluir a conta. Depois da exclusão, as ocorrências
      continuam públicas, sem identificar você.
    </p>

    <p class="fa-legenda">O texto completo da política será publicado nesta página.</p>
  </div>
</template>

<style scoped lang="scss">
.politica {
  p {
    margin: 0 0 12px;
  }

  h2 {
    margin: 16px 0 4px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
  }
}
</style>
