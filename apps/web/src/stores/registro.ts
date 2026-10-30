import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { Api } from '@/services/api';
import {
  type Candidata,
  confirmarOcorrencia,
  enviarOcorrencia,
  type ResultadoConfirmacao,
  type ResultadoEnvio,
} from '@/services/envio';
import type { Ponto } from '@/services/localizacao';
import {
  atributosParaEnvio,
  type Categoria,
  MAX_FOTOS,
  type OrigemPonto,
  passoDescricaoCompleto,
  passoFotosCompleto,
  passoLocalCompleto,
  TOTAL_PASSOS,
  type ValoresAtributos,
} from '@/services/registro';

export interface FotoRegistro {
  id: string;
  arquivo: File;
  /** URL local para a miniatura na tela. */
  url: string;
  /** Preenchida quando a foto chega ao storage. */
  uploadKey?: string;
}

export type Conclusao =
  | { tipo: 'CRIADA'; protocolo: string }
  | { tipo: 'CONFIRMADA'; protocolo: string; confirmacoes: number | null };

/** O registro em andamento. Fica na store, e não na URL: sair e voltar não perde as fotos. */
export const useRegistroStore = defineStore('registro', () => {
  /** Gerado no aparelho: repetir o envio não cria uma segunda ocorrência. */
  const id = ref(crypto.randomUUID());
  const passo = ref(1);
  const fotos = ref<FotoRegistro[]>([]);
  /** Fotos ainda sendo comprimidas. */
  const preparando = ref(0);
  const categoria = ref<Categoria | null>(null);
  const descricao = ref('');
  const atributos = ref<ValoresAtributos>({});

  const ponto = ref<Ponto | null>(null);
  const origemPonto = ref<OrigemPonto | null>(null);
  /** Só vale para o ponto do GPS: o pino posto à mão vai sem precisão. */
  const precisaoM = ref<number | null>(null);
  const endereco = ref<string | null>(null);
  const dentroDaArea = ref<boolean | null>(null);
  const consultandoEndereco = ref(false);
  const publicarAutor = ref(false);

  const enviando = ref(false);
  const conclusao = ref<Conclusao | null>(null);

  const vagasDeFoto = computed(() => MAX_FOTOS - fotos.value.length - preparando.value);

  const passoCompleto = computed(() => {
    if (passo.value === 1) {
      return preparando.value === 0 && passoFotosCompleto(fotos.value.length);
    }
    if (passo.value === 2) {
      return passoDescricaoCompleto(categoria.value, descricao.value, atributos.value);
    }
    return passoLocalCompleto({
      ponto: ponto.value,
      origem: origemPonto.value,
      dentroDaArea: dentroDaArea.value,
      consultando: consultandoEndereco.value,
    });
  });

  function adicionarFoto(arquivo: File): boolean {
    if (fotos.value.length >= MAX_FOTOS) return false;
    fotos.value.push({ id: crypto.randomUUID(), arquivo, url: URL.createObjectURL(arquivo) });
    return true;
  }

  function removerFoto(fotoId: string): void {
    const foto = fotos.value.find((item) => item.id === fotoId);
    if (foto) URL.revokeObjectURL(foto.url);
    fotos.value = fotos.value.filter((item) => item.id !== fotoId);
  }

  /** Os campos extras são de cada categoria: trocar de categoria limpa o que foi preenchido. */
  function escolherCategoria(nova: Categoria): void {
    if (categoria.value?.id !== nova.id) atributos.value = {};
    categoria.value = nova;
  }

  function posicionar(novo: Ponto, origem: OrigemPonto, precisao: number | null = null): void {
    ponto.value = novo;
    origemPonto.value = origem;
    precisaoM.value = origem === 'GPS' ? precisao : null;
    endereco.value = null;
    dentroDaArea.value = null;
  }

  function avancar(): void {
    if (passoCompleto.value && passo.value < TOTAL_PASSOS) passo.value += 1;
  }

  function voltar(): void {
    if (passo.value > 1) passo.value -= 1;
  }

  /** Um id novo exige fotos novas: as chaves do storage são do id antigo. */
  function trocarId(): void {
    id.value = crypto.randomUUID();
    fotos.value.forEach((foto) => delete foto.uploadKey);
  }

  async function enviar(api: Api, forcarCriacao = false): Promise<ResultadoEnvio> {
    enviando.value = true;
    try {
      let resultado = await tentarEnvio(api, forcarCriacao);
      if (resultado.tipo === 'ID_EM_USO') {
        trocarId();
        resultado = await tentarEnvio(api, forcarCriacao);
      }
      if (resultado.tipo === 'CRIADA') {
        conclusao.value = { tipo: 'CRIADA', protocolo: resultado.protocolo };
      }
      if (resultado.tipo === 'ERRO' && resultado.codigo === 'FOTO_NAO_ENVIADA') {
        fotos.value.forEach((foto) => delete foto.uploadKey);
      }
      return resultado;
    } finally {
      enviando.value = false;
    }
  }

  function tentarEnvio(api: Api, forcarCriacao: boolean): Promise<ResultadoEnvio> {
    return enviarOcorrencia(
      api,
      {
        id: id.value,
        categoriaId: categoria.value!.id,
        descricao: descricao.value,
        atributos: atributosParaEnvio(categoria.value!, atributos.value),
        ponto: ponto.value!,
        precisaoM: precisaoM.value,
        publicarAutor: publicarAutor.value,
        fotos: fotos.value.map((foto, indice) => ({
          arquivo: foto.arquivo,
          ordem: (indice + 1) as 1 | 2,
          uploadKey: foto.uploadKey,
        })),
      },
      {
        forcarCriacao,
        aoEnviarFoto: (ordem, uploadKey) => {
          const foto = fotos.value[ordem - 1];
          if (foto) foto.uploadKey = uploadKey;
        },
      },
    );
  }

  /** "Também vi": confirma a existente em vez de criar outra. */
  async function confirmar(api: Api, candidata: Candidata): Promise<ResultadoConfirmacao> {
    enviando.value = true;
    try {
      const resultado = await confirmarOcorrencia(api, candidata.id);
      if (resultado.tipo !== 'ERRO') {
        conclusao.value = {
          tipo: 'CONFIRMADA',
          protocolo: candidata.protocolo,
          confirmacoes: resultado.tipo === 'CONFIRMADA' ? resultado.confirmacoes : null,
        };
      }
      return resultado;
    } finally {
      enviando.value = false;
    }
  }

  function limpar(): void {
    fotos.value.forEach((foto) => URL.revokeObjectURL(foto.url));
    id.value = crypto.randomUUID();
    passo.value = 1;
    fotos.value = [];
    preparando.value = 0;
    categoria.value = null;
    descricao.value = '';
    atributos.value = {};
    ponto.value = null;
    origemPonto.value = null;
    precisaoM.value = null;
    endereco.value = null;
    dentroDaArea.value = null;
    consultandoEndereco.value = false;
    publicarAutor.value = false;
    conclusao.value = null;
  }

  return {
    id,
    passo,
    fotos,
    preparando,
    categoria,
    descricao,
    atributos,
    ponto,
    origemPonto,
    precisaoM,
    endereco,
    dentroDaArea,
    consultandoEndereco,
    publicarAutor,
    enviando,
    conclusao,
    vagasDeFoto,
    passoCompleto,
    adicionarFoto,
    removerFoto,
    escolherCategoria,
    posicionar,
    avancar,
    voltar,
    enviar,
    confirmar,
    limpar,
  };
});
