import { dataCurta } from '@/utils/status-ocorrencia';

import type { Api } from './api';
import {
  type ErroApi,
  errosDosCampos,
  lerErroApi,
  MENSAGEM_SEM_CONEXAO,
  mensagemDoErro,
} from './erros';
import type { Detalhe } from './ocorrencia';

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;
export const COMENTARIO_AVALIACAO_MAX = 500;
export const JUSTIFICATIVA_REABERTURA_MIN = 10;
export const JUSTIFICATIVA_REABERTURA_MAX = 500;

export interface DadosAvaliacao {
  nota: number | null;
  comentario: string;
}

/** O que falta para enviar a avaliação, por campo; vazio quando pode enviar. */
export function problemasDaAvaliacao({
  nota,
  comentario,
}: DadosAvaliacao): Partial<Record<'nota' | 'comentario', string>> {
  const problemas: Partial<Record<'nota' | 'comentario', string>> = {};
  if (nota === null || !Number.isInteger(nota) || nota < NOTA_MIN || nota > NOTA_MAX) {
    problemas.nota = 'Escolha de 1 a 5 estrelas.';
  }
  if (comentario.trim().length > COMENTARIO_AVALIACAO_MAX) {
    problemas.comentario = `O comentário pode ter até ${COMENTARIO_AVALIACAO_MAX} caracteres.`;
  }
  return problemas;
}

/** O que falta na justificativa de "Não foi resolvido"; null quando pode enviar. */
export function problemaDaJustificativa(justificativa: string): string | null {
  const tamanho = justificativa.trim().length;
  if (tamanho < JUSTIFICATIVA_REABERTURA_MIN) {
    return `Conte o que ainda está errado, com pelo menos ${JUSTIFICATIVA_REABERTURA_MIN} caracteres.`;
  }
  if (tamanho > JUSTIFICATIVA_REABERTURA_MAX) {
    return `A justificativa pode ter até ${JUSTIFICATIVA_REABERTURA_MAX} caracteres.`;
  }
  return null;
}

/**
 * Recusa do servidor. `recarregar` diz que a tela está desatualizada (a ocorrência mudou de
 * status, o prazo passou ou a pessoa perdeu o vínculo) e o detalhe precisa vir de novo.
 */
export interface ErroPosResolucao {
  tipo: 'ERRO';
  codigo: string | null;
  mensagem: string;
  recarregar: boolean;
  campos: Record<string, string>;
}

export type ResultadoAvaliacao = { tipo: 'AVALIADA' } | { tipo: 'JA_AVALIADA' } | ErroPosResolucao;

export type ResultadoReabertura = { tipo: 'REABERTA' } | ErroPosResolucao;

const MENSAGENS: Record<string, string> = {
  FORA_DO_PRAZO: 'O prazo para isso já passou.',
  NAO_RESOLVIDA: 'A ocorrência não está mais resolvida.',
  SEM_VINCULO: 'Só quem registrou ou confirmou a ocorrência pode fazer isso.',
  CONFLITO_STATUS: 'A prefeitura mudou o status desta ocorrência enquanto você via a página.',
};

const CODIGOS_DESATUALIZADOS = new Set([
  'FORA_DO_PRAZO',
  'NAO_RESOLVIDA',
  'SEM_VINCULO',
  'CONFLITO_STATUS',
]);

function erro(erroApi: ErroApi | null, padrao: string): ErroPosResolucao {
  const codigo = erroApi?.codigo ?? null;
  return {
    tipo: 'ERRO',
    codigo,
    mensagem: (codigo ? MENSAGENS[codigo] : undefined) ?? mensagemDoErro(erroApi, padrao),
    recarregar: codigo !== null && CODIGOS_DESATUALIZADOS.has(codigo),
    campos: errosDosCampos(erroApi),
  };
}

function semConexao(): ErroPosResolucao {
  return {
    tipo: 'ERRO',
    codigo: null,
    mensagem: MENSAGEM_SEM_CONEXAO,
    recarregar: false,
    campos: {},
  };
}

/** "Avaliar atendimento": nota de 1 a 5 e um comentário opcional. */
export async function avaliarOcorrencia(
  api: Api,
  id: string,
  { nota, comentario }: { nota: number; comentario?: string },
): Promise<ResultadoAvaliacao> {
  const texto = comentario?.trim() ?? '';
  try {
    const { data, error } = await api.POST('/api/v1/ocorrencias/{id}/avaliacoes', {
      params: { path: { id } },
      body: { nota, ...(texto && { comentario: texto }) },
    });
    if (data) return { tipo: 'AVALIADA' };
    const erroApi = lerErroApi(error);
    if (erroApi?.codigo === 'JA_AVALIADA') return { tipo: 'JA_AVALIADA' };
    return erro(erroApi, 'Não foi possível registrar a avaliação. Tente de novo.');
  } catch {
    return semConexao();
  }
}

/** "Não foi resolvido": a ocorrência volta para a análise da prefeitura. */
export async function reabrirOcorrencia(
  api: Api,
  id: string,
  justificativa: string,
): Promise<ResultadoReabertura> {
  try {
    const { data, error } = await api.POST('/api/v1/ocorrencias/{id}/reabertura', {
      params: { path: { id } },
      body: { justificativa: justificativa.trim() },
    });
    if (data) return { tipo: 'REABERTA' };
    return erro(lerErroApi(error), 'Não foi possível reabrir a ocorrência. Tente de novo.');
  } catch {
    return semConexao();
  }
}

/** O detalhe depois de avaliar: cada pessoa avalia uma vez. */
export function aplicarAvaliacao(detalhe: Detalhe): Detalhe {
  return { ...detalhe, pode_avaliar: false };
}

/** Ainda dá tempo de avaliar ou reabrir. Sem prazo informado, quem decide é a API. */
export function prazoVigente(prazo: string | null | undefined, agora = new Date()): boolean {
  if (!prazo) return true;
  return new Date(prazo).getTime() >= agora.getTime();
}

/** "Disponível até 14/11/2026"; null sem prazo ou com o prazo vencido. */
export function textoDoPrazo(prazo: string | null | undefined, agora = new Date()): string | null {
  if (!prazo || !prazoVigente(prazo, agora)) return null;
  return `Disponível até ${dataCurta(prazo)}`;
}

/** Foi reaberta e ainda não voltou a ser resolvida. */
export function estaReaberta(detalhe: Detalhe): boolean {
  return detalhe.reaberturas.length > 0 && detalhe.status_publico !== 'RESOLVIDO';
}
