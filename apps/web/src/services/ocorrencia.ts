import type { components } from '@fiscaliza/contratos';

import { statusAberto } from '@/utils/status-ocorrencia';

import type { Api } from './api';
import type { ResultadoConfirmacao } from './envio';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';

export type Detalhe = components['schemas']['DetalheResposta'];
export type MinhaOcorrencia = components['schemas']['MinhaOcorrenciaResposta'];
type Etapa = components['schemas']['EtapaResposta']['etapa'];

export type ResultadoDetalhe =
  | { tipo: 'OK'; detalhe: Detalhe }
  | { tipo: 'NAO_ENCONTRADA' }
  | { tipo: 'ERRO'; mensagem: string };

const MENSAGEM_DETALHE = 'Não foi possível carregar a ocorrência. Tente de novo.';
const MENSAGEM_MINHAS = 'Não foi possível carregar suas ocorrências. Tente de novo.';

/**
 * O detalhe abre sem login. Com sessão, o cliente manda o token e a API inclui os campos de
 * quem está vendo (se já confirmou, se pode confirmar…).
 */
export async function buscarDetalhe(api: Api, id: string): Promise<ResultadoDetalhe> {
  try {
    const { data, error, response } = await api.GET('/api/v1/ocorrencias/{id}', {
      params: { path: { id } },
    });
    if (data) return { tipo: 'OK', detalhe: data };
    if (response.status === 404) return { tipo: 'NAO_ENCONTRADA' };
    return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_DETALHE) };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}

/**
 * O botão "Também vi":
 * - OCULTO: autor, ocorrência fechada ou quem não é cidadão;
 * - ENTRAR: visitante, que vai ao login e volta para o detalhe;
 * - CONFIRMAR: cidadão que ainda não confirmou;
 * - CONFIRMADO: "Você confirmou", sem ação.
 */
export type EstadoTambemVi = 'OCULTO' | 'ENTRAR' | 'CONFIRMAR' | 'CONFIRMADO';

export function estadoTambemVi(detalhe: Detalhe, logado: boolean): EstadoTambemVi {
  if (logado && detalhe.minha_confirmacao) return 'CONFIRMADO';
  if (!statusAberto(detalhe.status_publico)) return 'OCULTO';
  if (!logado) return 'ENTRAR';
  return detalhe.pode_confirmar ? 'CONFIRMAR' : 'OCULTO';
}

/**
 * O detalhe depois de tocar em "Também vi". O total vem da API, já com esta confirmação; se a
 * pessoa já tinha confirmado (outra aba, toque duplo), o contador fica como está.
 */
export function aplicarConfirmacao(
  detalhe: Detalhe,
  resultado: ResultadoConfirmacao,
  limiarUrgente: number | null,
): { detalhe: Detalhe; mensagem: string | null } {
  if (resultado.tipo === 'ERRO') return { detalhe, mensagem: resultado.mensagem };
  const confirmacoes =
    resultado.tipo === 'CONFIRMADA' ? resultado.confirmacoes : detalhe.confirmacoes;
  return {
    detalhe: {
      ...detalhe,
      confirmacoes,
      urgente: detalhe.urgente || (limiarUrgente !== null && confirmacoes >= limiarUrgente),
      minha_confirmacao: true,
      pode_confirmar: false,
    },
    mensagem: null,
  };
}

export interface PassoLinhaDoTempo {
  etapa: Etapa;
  rotulo: string;
  /** null nas etapas que ainda não aconteceram. */
  data: string | null;
  /** A justificativa de quem disse "Não foi resolvido". */
  observacao: string | null;
}

const ROTULOS_ETAPA: Record<Etapa, string> = {
  RECEBIDO: 'Recebido',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
  REABERTO: 'Reaberto: não foi resolvido',
  RECUSADO: 'Recusado pela prefeitura',
  DUPLICADO: 'Marcado como duplicado',
};

/**
 * Recebido → Em andamento → Resolvido: as etapas que já aconteceram, com a data e na ordem da API
 * (as reaberturas entram no meio), seguidas das que ainda faltam, sem data.
 */
export function montarLinhaDoTempo(detalhe: Detalhe): PassoLinhaDoTempo[] {
  const justificativas = detalhe.reaberturas.map((r) => r.justificativa);
  const atingidas = detalhe.linha_do_tempo.map(({ etapa, data }) => ({
    etapa,
    rotulo: ROTULOS_ETAPA[etapa],
    data,
    observacao: etapa === 'REABERTO' ? (justificativas.shift() ?? null) : null,
  }));
  const faltam: Etapa[] =
    detalhe.status_publico === 'RECEBIDO'
      ? ['EM_ANDAMENTO', 'RESOLVIDO']
      : detalhe.status_publico === 'EM_ANDAMENTO'
        ? ['RESOLVIDO']
        : [];
  return [
    ...atingidas,
    ...faltam.map((etapa) => ({
      etapa,
      rotulo: ROTULOS_ETAPA[etapa],
      data: null,
      observacao: null,
    })),
  ];
}

type CampoAtributo = components['schemas']['CampoAtributoResposta'];

/**
 * Os campos extras com o rótulo da categoria ("Número do poste: 1234"), na ordem do formulário.
 * Um campo que a categoria não tem mais aparece no fim, com a chave.
 */
export function atributosLegiveis(
  atributos: Detalhe['atributos'],
  campos: readonly CampoAtributo[],
): { rotulo: string; valor: string }[] {
  const conhecidos = campos
    .filter((campo) => atributos[campo.chave] !== undefined && atributos[campo.chave] !== '')
    .map((campo) => ({ rotulo: campo.rotulo, valor: String(atributos[campo.chave]) }));
  const chaves = new Set(campos.map((campo) => campo.chave));
  const outros = Object.entries(atributos)
    .filter(([chave, valor]) => !chaves.has(chave) && valor !== '')
    .map(([chave, valor]) => ({ rotulo: chave, valor: String(valor) }));
  return [...conhecidos, ...outros];
}

export type ResultadoCompartilhar = 'COMPARTILHADO' | 'COPIADO' | 'CANCELADO' | 'INDISPONIVEL';

export interface DadosCompartilhar {
  titulo: string;
  texto: string;
  url: string;
}

/**
 * Abre o compartilhamento nativo do aparelho. Onde não existe (a maioria dos computadores),
 * copia o link. Fechar a folha de compartilhamento não é erro.
 */
export async function compartilhar(
  dados: DadosCompartilhar,
  navegador: Partial<Pick<Navigator, 'share' | 'clipboard'>> = navigator,
): Promise<ResultadoCompartilhar> {
  if (typeof navegador.share === 'function') {
    try {
      await navegador.share({ title: dados.titulo, text: dados.texto, url: dados.url });
      return 'COMPARTILHADO';
    } catch (erro) {
      if (erro instanceof DOMException && erro.name === 'AbortError') return 'CANCELADO';
      // Sem permissão para compartilhar (ex.: fora de um toque): tenta copiar.
    }
  }
  try {
    if (!navegador.clipboard) return 'INDISPONIVEL';
    await navegador.clipboard.writeText(dados.url);
    return 'COPIADO';
  } catch {
    return 'INDISPONIVEL';
  }
}

export type ResultadoMinhas =
  | { tipo: 'OK'; itens: MinhaOcorrencia[]; proximoCursor: string | null }
  | { tipo: 'ERRO'; mensagem: string };

export const MINHAS_POR_PAGINA = 20;

/** Uma página de "Minhas ocorrências", com todos os status. */
export async function buscarMinhas(api: Api, cursor: string | null): Promise<ResultadoMinhas> {
  try {
    const { data, error } = await api.GET('/api/v1/me/ocorrencias', {
      params: { query: { limite: MINHAS_POR_PAGINA, ...(cursor && { cursor }) } },
    });
    if (!data)
      return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_MINHAS) };
    return { tipo: 'OK', itens: data.itens, proximoCursor: data.proximo_cursor };
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
  }
}
