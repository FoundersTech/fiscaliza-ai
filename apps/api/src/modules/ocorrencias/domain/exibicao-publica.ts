import { StatusOcorrencia } from './ocorrencia.js';

/** Como o status aparece no app: as três etapas que o cidadão enxerga. */
export const StatusPublico = {
  RECEBIDO: 'RECEBIDO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  RESOLVIDO: 'RESOLVIDO',
} as const;
export type StatusPublico = (typeof StatusPublico)[keyof typeof StatusPublico];

const STATUS_INTERNOS: Readonly<Record<StatusPublico, readonly StatusOcorrencia[]>> = {
  RECEBIDO: [StatusOcorrencia.RECEBIDA],
  EM_ANDAMENTO: [StatusOcorrencia.EM_ANALISE, StatusOcorrencia.EM_EXECUCAO],
  RESOLVIDO: [StatusOcorrencia.RESOLVIDA],
};

/** Status que aparecem para qualquer pessoa. Recusada e duplicada ficam só para o autor. */
export const VISIVEIS_AO_PUBLICO: readonly StatusOcorrencia[] =
  Object.values(STATUS_INTERNOS).flat();

export function statusPublicoDe(status: StatusOcorrencia): StatusPublico | null {
  const publico = (Object.keys(STATUS_INTERNOS) as StatusPublico[]).find((chave) =>
    STATUS_INTERNOS[chave].includes(status),
  );
  return publico ?? null;
}

/** Os status internos de um filtro público; sem filtro, todos os visíveis. */
export function statusInternosDe(publicos: readonly StatusPublico[] | null): StatusOcorrencia[] {
  if (!publicos?.length) return [...VISIVEIS_AO_PUBLICO];
  return [...new Set(publicos.flatMap((publico) => STATUS_INTERNOS[publico]))];
}

export const TAMANHO_RESUMO = 120;

/** Começo da descrição, com reticências quando ela passa de 120 caracteres. */
export function resumir(descricao: string): string {
  return descricao.length > TAMANHO_RESUMO
    ? `${descricao.slice(0, TAMANHO_RESUMO - 1).trimEnd()}…`
    : descricao;
}

/** Com o limiar de confirmações ou mais, a ocorrência ganha o selo URGENTE. */
export function ehUrgente(confirmacoes: number, limiar: number): boolean {
  return confirmacoes >= limiar;
}

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function diaCivil(data: Date): number {
  return Date.parse(`${DIA_EM_SAO_PAULO.format(data)}T00:00:00Z`);
}

/**
 * Dias de calendário (em Sorocaba) desde a criação até hoje, ou até a resolução se ela já foi
 * resolvida. Registrada hoje: 0; ontem, mesmo que às 23h: 1.
 */
export function diasEmAberto(criadaEm: Date, resolvidaEm: Date | null, agora: Date): number {
  const fim = resolvidaEm ?? agora;
  return Math.max(0, Math.round((diaCivil(fim) - diaCivil(criadaEm)) / UM_DIA_MS));
}
