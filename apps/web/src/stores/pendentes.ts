import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';

import type { Api } from '@/services/api';
import {
  type DadosEnvio,
  enviarOcorrencia,
  erroPassageiro,
  type ResultadoEnvio,
} from '@/services/envio';
import { abrirPendentes, type Pendente } from '@/services/pendentes';
import { useAuthStore } from '@/stores/auth';

/** O que a tela do registro passa para guardar no aparelho. */
export interface NovaPendente {
  categoriaNome: string;
  endereco: string | null;
  dados: DadosEnvio;
}

/** Pendente que acabou de chegar ao servidor, com o protocolo recebido. */
export interface PendenteEnviada {
  chave: string;
  protocolo: string;
  categoriaNome: string;
  descricao: string;
}

/**
 * As ocorrências que ainda não chegaram ao servidor. Ficam no IndexedDB, separadas por usuário:
 * só as do usuário logado são enviadas.
 */
export const usePendentesStore = defineStore('pendentes', () => {
  const repositorio = abrirPendentes();
  const auth = useAuthStore();

  /** As do usuário logado, da mais antiga para a mais nova. */
  const lista = shallowRef<Pendente[]>([]);
  /** Todas as do aparelho, de qualquer usuário: é o que o visitante vê no aviso para entrar. */
  const totalNoAparelho = ref(0);
  const enviadas = ref<PendenteEnviada[]>([]);
  const sincronizando = ref(false);
  let emAndamento: Promise<void> | null = null;

  const quantidade = computed(() => lista.value.length);

  async function carregar(): Promise<void> {
    const todas = await repositorio.listar();
    const usuarioId = auth.usuario?.id;
    totalNoAparelho.value = todas.length;
    lista.value = usuarioId ? todas.filter((p) => p.usuarioId === usuarioId) : [];
  }

  /** Grava a mudança no banco e na lista da tela. */
  async function gravar(pendente: Pendente): Promise<Pendente> {
    await repositorio.salvar(pendente);
    const existe = lista.value.some((p) => p.chave === pendente.chave);
    lista.value = existe
      ? lista.value.map((p) => (p.chave === pendente.chave ? pendente : p))
      : [...lista.value, pendente];
    if (!existe) totalNoAparelho.value += 1;
    return pendente;
  }

  async function tirar(chave: string): Promise<void> {
    await repositorio.remover(chave);
    lista.value = lista.value.filter((p) => p.chave !== chave);
    totalNoAparelho.value = Math.max(0, totalNoAparelho.value - 1);
  }

  async function guardar({ categoriaNome, endereco, dados }: NovaPendente): Promise<Pendente> {
    const usuarioId = auth.usuario?.id;
    if (!usuarioId) throw new Error('Só quem está logado guarda ocorrências no aparelho.');
    const { fotos, ponto, atributos, ...resto } = dados;
    return gravar({
      chave: crypto.randomUUID(),
      usuarioId,
      criadaEm: new Date().toISOString(),
      categoriaNome,
      endereco,
      // Cópias simples: o IndexedDB não grava os objetos reativos da tela.
      dados: { ...resto, ponto: { lat: ponto.lat, lng: ponto.lng }, atributos: { ...atributos } },
      fotos: fotos.map((foto) => ({
        arquivo: foto.arquivo,
        ordem: foto.ordem,
        uploadKey: foto.uploadKey,
      })),
      estado: 'AGUARDANDO',
      erro: null,
    });
  }

  async function tentarEnvio(api: Api, pendente: Pendente): Promise<ResultadoEnvio> {
    const fotos = pendente.fotos.map((foto) => ({ ...foto }));
    let gravacao: Promise<unknown> = Promise.resolve();
    const resultado = await enviarOcorrencia(
      api,
      { ...pendente.dados, fotos },
      {
        origem: 'OFFLINE',
        aoEnviarFoto: (ordem, uploadKey) => {
          const foto = fotos.find((item) => item.ordem === ordem);
          if (foto) foto.uploadKey = uploadKey;
          // A foto que chegou ao storage não sobe de novo se o registro cair depois dela.
          const copia = { ...pendente, fotos: fotos.map((f) => ({ ...f })) };
          gravacao = gravacao.then(() => gravar(copia));
        },
      },
    );
    await gravacao;
    return resultado;
  }

  /** Devolve false quando falta conexão: não adianta tentar as outras agora. */
  async function enviarUma(api: Api, original: Pendente): Promise<boolean> {
    let pendente = await gravar({ ...original, estado: 'ENVIANDO', erro: null });
    let resultado = await tentarEnvio(api, pendente);
    if (resultado.tipo === 'ID_EM_USO') {
      // O id gerado no aparelho já é de outra pessoa: um novo exige subir as fotos de novo.
      pendente = await gravar({
        ...(lista.value.find((p) => p.chave === pendente.chave) ?? pendente),
        dados: { ...pendente.dados, id: crypto.randomUUID() },
        fotos: pendente.fotos.map(({ arquivo, ordem }) => ({ arquivo, ordem })),
      });
      resultado = await tentarEnvio(api, pendente);
    }
    const atual = lista.value.find((p) => p.chave === pendente.chave) ?? pendente;

    if (resultado.tipo === 'CRIADA') {
      await tirar(atual.chave);
      enviadas.value.push({
        chave: atual.chave,
        protocolo: resultado.protocolo,
        categoriaNome: atual.categoriaNome,
        descricao: atual.dados.descricao,
      });
      return true;
    }
    if (resultado.tipo === 'ERRO' && !erroPassageiro(resultado)) {
      await gravar({ ...atual, estado: 'ERRO', erro: resultado.mensagem });
      return true;
    }
    const fotoPerdida = resultado.tipo === 'ERRO' && resultado.codigo === 'FOTO_NAO_ENVIADA';
    await gravar({
      ...atual,
      estado: 'AGUARDANDO',
      erro: null,
      fotos: fotoPerdida
        ? atual.fotos.map(({ arquivo, ordem }) => ({ arquivo, ordem }))
        : atual.fotos,
    });
    return !(resultado.tipo === 'ERRO' && resultado.codigo === null);
  }

  async function rodada(api: Api): Promise<void> {
    await carregar();
    if (!auth.logado) return;
    sincronizando.value = true;
    try {
      // As recusadas esperam o cidadão descartar; ENVIANDO que sobrou de um app fechado volta à fila.
      for (const pendente of lista.value.filter((p) => p.estado !== 'ERRO')) {
        if (!(await enviarUma(api, pendente))) break;
      }
    } finally {
      sincronizando.value = false;
    }
  }

  /** Envia as do usuário logado. Uma chamada durante outra espera a que está em andamento. */
  function sincronizar(api: Api): Promise<void> {
    emAndamento ??= rodada(api).finally(() => {
      emAndamento = null;
    });
    return emAndamento;
  }

  async function descartar(chave: string): Promise<void> {
    await tirar(chave);
  }

  /** Sair da conta descarta as pendentes de quem saiu. */
  async function descartarDoUsuario(): Promise<void> {
    const usuarioId = auth.usuario?.id;
    if (!usuarioId) return;
    await repositorio.removerDoUsuario(usuarioId);
    await carregar();
  }

  return {
    lista,
    quantidade,
    totalNoAparelho,
    enviadas,
    sincronizando,
    carregar,
    guardar,
    sincronizar,
    descartar,
    descartarDoUsuario,
  };
});
