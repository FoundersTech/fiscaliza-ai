import type { components } from '@fiscaliza/contratos';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type Perfil = components['schemas']['PerfilResposta'];
export type Papel = Perfil['papel'];

/**
 * Sessão do usuário. O token fica só em memória: recarregar a página sai da conta até a
 * renovação de sessão chegar.
 */
export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const usuario = ref<Perfil | null>(null);

  const logado = computed(() => accessToken.value !== null && usuario.value !== null);
  const papel = computed<Papel | null>(() => usuario.value?.papel ?? null);

  function iniciarSessao(token: string, perfil: Perfil): void {
    accessToken.value = token;
    usuario.value = perfil;
  }

  function encerrarSessao(): void {
    accessToken.value = null;
    usuario.value = null;
  }

  return { accessToken, usuario, logado, papel, iniciarSessao, encerrarSessao };
});
