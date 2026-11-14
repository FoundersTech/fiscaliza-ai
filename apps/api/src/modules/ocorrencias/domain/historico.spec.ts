import { describe, expect, it } from 'vitest';

import {
  type EventoHistorico,
  justificativaRecusa,
  linhaDoTempo,
  reaberturas,
  respostasOficiais,
} from './historico.js';
import { StatusOcorrencia } from './ocorrencia.js';

const { RECEBIDA, EM_ANALISE, EM_EXECUCAO, RESOLVIDA, RECUSADA } = StatusOcorrencia;
const ORGAO = 'Prefeitura de Sorocaba';
const CRIADA = new Date('2026-10-01T12:00:00Z');

function dia(n: number): Date {
  return new Date(Date.UTC(2026, 9, n, 12));
}

function evento(
  deStatus: StatusOcorrencia | null,
  paraStatus: StatusOcorrencia,
  criadoEm: Date,
  comentario: string | null = null,
  orgao: string | null = ORGAO,
): EventoHistorico {
  return { deStatus, paraStatus, orgao, comentario, criadoEm };
}

/** Criada, analisada, executada, resolvida, reaberta pelo cidadão e resolvida de novo. */
const REABERTA: EventoHistorico[] = [
  evento(null, RECEBIDA, CRIADA, null, null),
  evento(RECEBIDA, EM_ANALISE, dia(2)),
  evento(EM_ANALISE, EM_EXECUCAO, dia(3), 'Equipe a caminho'),
  evento(EM_EXECUCAO, RESOLVIDA, dia(5), 'Lâmpada trocada'),
  evento(RESOLVIDA, EM_ANALISE, dia(6), 'Apagou de novo na mesma noite', null),
  evento(EM_ANALISE, EM_EXECUCAO, dia(7)),
  evento(EM_EXECUCAO, RESOLVIDA, dia(8), 'Reator trocado'),
];

describe('linha do tempo', () => {
  it('só com a criação, mostra apenas Recebido', () => {
    expect(linhaDoTempo(CRIADA, [evento(null, RECEBIDA, CRIADA, null, null)])).toEqual([
      { etapa: 'RECEBIDO', data: CRIADA },
    ]);
  });

  it('análise e execução contam como uma etapa; a reabertura entra com a data', () => {
    expect(linhaDoTempo(CRIADA, REABERTA)).toEqual([
      { etapa: 'RECEBIDO', data: CRIADA },
      { etapa: 'EM_ANDAMENTO', data: dia(2) },
      { etapa: 'RESOLVIDO', data: dia(5) },
      { etapa: 'REABERTO', data: dia(6) },
      { etapa: 'RESOLVIDO', data: dia(8) },
    ]);
  });

  it('a ordem vem da data, não da ordem recebida', () => {
    const etapas = linhaDoTempo(CRIADA, [...REABERTA].reverse()).map((item) => item.etapa);
    expect(etapas).toEqual(['RECEBIDO', 'EM_ANDAMENTO', 'RESOLVIDO', 'REABERTO', 'RESOLVIDO']);
  });

  it('a recusa aparece como etapa final', () => {
    const eventos = [evento(RECEBIDA, RECUSADA, dia(2), 'Fora da competência do município')];
    expect(linhaDoTempo(CRIADA, eventos).at(-1)).toEqual({ etapa: 'RECUSADO', data: dia(2) });
  });
});

describe('respostas, reaberturas e recusa', () => {
  it('as respostas são os comentários do órgão, sem a justificativa do cidadão', () => {
    expect(respostasOficiais(REABERTA)).toEqual([
      { orgao: ORGAO, comentario: 'Equipe a caminho', data: dia(3) },
      { orgao: ORGAO, comentario: 'Lâmpada trocada', data: dia(5) },
      { orgao: ORGAO, comentario: 'Reator trocado', data: dia(8) },
    ]);
  });

  it('cada reabertura traz a justificativa e a data', () => {
    expect(reaberturas(REABERTA)).toEqual([
      { justificativa: 'Apagou de novo na mesma noite', data: dia(6) },
    ]);
  });

  it('a justificativa de recusa só existe quando o status é recusada', () => {
    const eventos = [evento(RECEBIDA, RECUSADA, dia(2), 'Fora da competência do município')];
    expect(justificativaRecusa(RECUSADA, eventos)).toBe('Fora da competência do município');
    expect(justificativaRecusa(RESOLVIDA, REABERTA)).toBeNull();
  });
});
