import type { components } from '@fiscaliza/contratos';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type Perfil = components['schemas']['PerfilResposta'];
export type Papel = Perfil['papel'];
export type SessaoAberta = components['schemas']['SessaoResposta'];

/**
 * Sessão do usuário. O access token fica só em memória; ao recarregar a página, a renovação pelo
 * cookie traz um novo antes de o app aparecer.
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const usuario = ref<Perfil | null>(null);

  const logado = computed(() => accessToken.value !== null && usuario.value !== null);
  const papel = computed<Papel | null>(() => usuario.value?.papel ?? null);
  const precisaAceitarPolitica = computed(() => usuario.value?.precisa_aceitar_politica === true);

  function iniciarSessao(sessao: SessaoAberta): void {
    accessToken.value = sessao.access_token;
    usuario.value = sessao.usuario;
  }

  function encerrarSessao(): void {
    accessToken.value = null;
    usuario.value = null;
  }

  function marcarPolitica(pendente: boolean): void {
    if (usuario.value) usuario.value = { ...usuario.value, precisa_aceitar_politica: pendente };
  }

  return {
    accessToken,
    usuario,
    logado,
    papel,
    precisaAceitarPolitica,
    iniciarSessao,
    encerrarSessao,
    marcarPolitica,
  };
});

export type AuthStore = ReturnType<typeof useAuthStore>;
