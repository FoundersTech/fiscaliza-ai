import { describe, expect, it } from 'vitest';

import {
  diasEmAberto,
  ehUrgente,
  resumir,
  StatusPublico,
  statusInternosDe,
  statusPublicoDe,
  VISIVEIS_AO_PUBLICO,
} from './exibicao-publica.js';
import { StatusOcorrencia } from './ocorrencia.js';

describe('status público', () => {
  it.each([
    [StatusOcorrencia.RECEBIDA, StatusPublico.RECEBIDO],
    [StatusOcorrencia.EM_ANALISE, StatusPublico.EM_ANDAMENTO],
    [StatusOcorrencia.EM_EXECUCAO, StatusPublico.EM_ANDAMENTO],
    [StatusOcorrencia.RESOLVIDA, StatusPublico.RESOLVIDO],
    [StatusOcorrencia.RECUSADA, null],
    [StatusOcorrencia.DUPLICADA, null],
  ])('%s aparece como %s', (interno, publico) => {
    expect(statusPublicoDe(interno)).toBe(publico);
  });

  it('recusada e duplicada não são visíveis ao público', () => {
    expect(VISIVEIS_AO_PUBLICO).not.toContain(StatusOcorrencia.RECUSADA);
    expect(VISIVEIS_AO_PUBLICO).not.toContain(StatusOcorrencia.DUPLICADA);
    expect(VISIVEIS_AO_PUBLICO).toHaveLength(4);
  });

  it('o filtro "em andamento" cobre análise e execução', () => {
    expect(statusInternosDe([StatusPublico.EM_ANDAMENTO])).toEqual([
      StatusOcorrencia.EM_ANALISE,
      StatusOcorrencia.EM_EXECUCAO,
    ]);
  });

  it('sem filtro de status, valem todos os visíveis', () => {
    expect(statusInternosDe(null)).toEqual(VISIVEIS_AO_PUBLICO);
    expect(statusInternosDe([])).toEqual(VISIVEIS_AO_PUBLICO);
  });
});

describe('resumir', () => {
  it('mantém descrições de até 120 caracteres', () => {
    const texto = 'a'.repeat(120);
    expect(resumir(texto)).toBe(texto);
  });

  it('corta as maiores com reticências, em 120 caracteres', () => {
    const resumo = resumir('palavra '.repeat(30));
    expect(resumo.length).toBeLessThanOrEqual(120);
    expect(resumo.endsWith('…')).toBe(true);
  });
});

describe('ehUrgente', () => {
  it('com o limiar de confirmações ou mais, é urgente; com uma a menos, não', () => {
    expect(ehUrgente(10, 10)).toBe(true);
    expect(ehUrgente(11, 10)).toBe(true);
    expect(ehUrgente(9, 10)).toBe(false);
  });
});

describe('diasEmAberto', () => {
  const agora = new Date('2026-11-14T15:00:00Z'); // 12h em Sorocaba

  it('registrada hoje: 0 dias', () => {
    expect(diasEmAberto(new Date('2026-11-14T10:00:00Z'), null, agora)).toBe(0);
  });

  it('conta dias de calendário em Sorocaba, não períodos de 24 h', () => {
    // 23h30 de 13/11 em Sorocaba (02h30 UTC de 14/11): ontem.
    expect(diasEmAberto(new Date('2026-11-14T02:30:00Z'), null, agora)).toBe(1);
  });

  it('conta até hoje enquanto aberta', () => {
    expect(diasEmAberto(new Date('2026-11-04T15:00:00Z'), null, agora)).toBe(10);
  });

  it('resolvida: para de contar na resolução', () => {
    expect(
      diasEmAberto(new Date('2026-10-01T15:00:00Z'), new Date('2026-10-08T15:00:00Z'), agora),
    ).toBe(7);
  });
});
