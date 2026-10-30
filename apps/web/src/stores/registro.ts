import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import {
  type Categoria,
  MAX_FOTOS,
  passoDescricaoCompleto,
  passoFotosCompleto,
  TOTAL_PASSOS,
  type ValoresAtributos,
} from '@/services/registro';

export interface FotoRegistro {
  id: string;
  arquivo: File;
  /** URL local para a miniatura na tela. */
  url: string;
}

/** O registro em andamento. Fica na store, e não na URL: sair e voltar não perde as fotos. */
export const useRegistroStore = defineStore('registro', () => {
  const passo = ref(1);
  const fotos = ref<FotoRegistro[]>([]);
  /** Fotos ainda sendo comprimidas. */
  const preparando = ref(0);
  const categoria = ref<Categoria | null>(null);
  const descricao = ref('');
  const atributos = ref<ValoresAtributos>({});

  const vagasDeFoto = computed(() => MAX_FOTOS - fotos.value.length - preparando.value);

  const passoCompleto = computed(() => {
    if (passo.value === 1) {
      return preparando.value === 0 && passoFotosCompleto(fotos.value.length);
    }
    if (passo.value === 2) {
      return passoDescricaoCompleto(categoria.value, descricao.value, atributos.value);
    }
    return false;
  });

  function adicionarFoto(arquivo: File): boolean {
    if (fotos.value.length >= MAX_FOTOS) return false;
    fotos.value.push({ id: crypto.randomUUID(), arquivo, url: URL.createObjectURL(arquivo) });
    return true;
  }

  function removerFoto(id: string): void {
    const foto = fotos.value.find((item) => item.id === id);
    if (foto) URL.revokeObjectURL(foto.url);
    fotos.value = fotos.value.filter((item) => item.id !== id);
  }

  /** Os campos extras são de cada categoria: trocar de categoria limpa o que foi preenchido. */
  function escolherCategoria(nova: Categoria): void {
    if (categoria.value?.id !== nova.id) atributos.value = {};
    categoria.value = nova;
  }

  function avancar(): void {
    if (passoCompleto.value && passo.value < TOTAL_PASSOS) passo.value += 1;
  }

  function voltar(): void {
    if (passo.value > 1) passo.value -= 1;
  }

  function limpar(): void {
    fotos.value.forEach((foto) => URL.revokeObjectURL(foto.url));
    passo.value = 1;
    fotos.value = [];
    preparando.value = 0;
    categoria.value = null;
    descricao.value = '';
    atributos.value = {};
  }

  return {
    passo,
    fotos,
    preparando,
    categoria,
    descricao,
    atributos,
    vagasDeFoto,
    passoCompleto,
    adicionarFoto,
    removerFoto,
    escolherCategoria,
    avancar,
    voltar,
    limpar,
  };
});
