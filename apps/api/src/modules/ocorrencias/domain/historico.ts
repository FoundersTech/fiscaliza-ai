import { StatusOcorrencia } from './ocorrencia.js';

const { RECEBIDA, EM_ANALISE, EM_EXECUCAO, RESOLVIDA, RECUSADA, DUPLICADA } = StatusOcorrencia;

/** Etapas da linha do tempo, como o cidadão as vê. */
export const EtapaLinhaDoTempo = {
  RECEBIDO: 'RECEBIDO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  RESOLVIDO: 'RESOLVIDO',
  REABERTO: 'REABERTO',
  RECUSADO: 'RECUSADO',
  DUPLICADO: 'DUPLICADO',
} as const;
export type EtapaLinhaDoTempo = (typeof EtapaLinhaDoTempo)[keyof typeof EtapaLinhaDoTempo];

/** Um evento de status, sem quem o fez: o autor do evento nunca sai em resposta pública. */
export interface EventoHistorico {
  deStatus: StatusOcorrencia | null;
  paraStatus: StatusOcorrencia;
  /** Nome do órgão quando foi o agente que mudou o status; null para o cidadão. */
  orgao: string | null;
  comentario: string | null;
  criadoEm: Date;
}

export interface EtapaAtingida {
  etapa: EtapaLinhaDoTempo;
  data: Date;
}

export interface RespostaOficial {
  orgao: string;
  comentario: string;
  data: Date;
}

export interface Reabertura {
  justificativa: string;
  data: Date;
}

function ehReabertura(evento: EventoHistorico): boolean {
  return evento.deStatus === RESOLVIDA && evento.paraStatus === EM_ANALISE;
}

function etapaDe(evento: EventoHistorico): EtapaLinhaDoTempo | null {
  if (ehReabertura(evento)) return EtapaLinhaDoTempo.REABERTO;
  switch (evento.paraStatus) {
    case EM_ANALISE:
    case EM_EXECUCAO:
      // Análise e execução são a mesma etapa: só a entrada nela conta.
      return evento.deStatus === RECEBIDA ? EtapaLinhaDoTempo.EM_ANDAMENTO : null;
    case RESOLVIDA:
      return EtapaLinhaDoTempo.RESOLVIDO;
    case RECUSADA:
      return EtapaLinhaDoTempo.RECUSADO;
    case DUPLICADA:
      return EtapaLinhaDoTempo.DUPLICADO;
    default:
      return null;
  }
}

/** Mais antigo primeiro; o sort é estável, então empates mantêm a ordem de gravação. */
function emOrdem(eventos: readonly EventoHistorico[]): EventoHistorico[] {
  return [...eventos].sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
}

/**
 * Recebido → Em andamento → Resolvido, com a data de cada etapa atingida. Cada reabertura entra
 * com a data dela, e o que vem depois (nova resolução) aparece de novo na sequência.
 */
export function linhaDoTempo(criadaEm: Date, eventos: readonly EventoHistorico[]): EtapaAtingida[] {
  const etapas: EtapaAtingida[] = [{ etapa: EtapaLinhaDoTempo.RECEBIDO, data: criadaEm }];
  for (const evento of emOrdem(eventos)) {
    const etapa = etapaDe(evento);
    if (etapa) etapas.push({ etapa, data: evento.criadoEm });
  }
  return etapas;
}

/** "Resposta da prefeitura": os comentários que o órgão deixou ao mudar o status. */
export function respostasOficiais(eventos: readonly EventoHistorico[]): RespostaOficial[] {
  return emOrdem(eventos).flatMap((evento) =>
    evento.orgao && evento.comentario
      ? [{ orgao: evento.orgao, comentario: evento.comentario, data: evento.criadoEm }]
      : [],
  );
}

export function reaberturas(eventos: readonly EventoHistorico[]): Reabertura[] {
  return emOrdem(eventos).flatMap((evento) =>
    ehReabertura(evento) && evento.comentario
      ? [{ justificativa: evento.comentario, data: evento.criadoEm }]
      : [],
  );
}

/** A justificativa da recusa, que só o autor vê; null se a ocorrência não foi recusada. */
export function justificativaRecusa(
  status: StatusOcorrencia,
  eventos: readonly EventoHistorico[],
): string | null {
  if (status !== RECUSADA) return null;
  const recusa = emOrdem(eventos).findLast((evento) => evento.paraStatus === RECUSADA);
  return recusa?.comentario ?? null;
}
