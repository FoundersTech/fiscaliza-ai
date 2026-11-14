import { describe, expect, it } from 'vitest';

import {
  classeDoStatus,
  dataCurta,
  rotuloDoStatusVisivel,
  statusAberto,
  textoDosDiasVisivel,
} from './status-ocorrencia';

describe('status da ocorrência', () => {
  it('mostra os cinco status com o texto do app', () => {
    expect(rotuloDoStatusVisivel('RECEBIDO')).toBe('Recebido');
    expect(rotuloDoStatusVisivel('EM_ANDAMENTO')).toBe('Em andamento');
    expect(rotuloDoStatusVisivel('RESOLVIDO')).toBe('Resolvido');
    expect(rotuloDoStatusVisivel('RECUSADO')).toBe('Recusado');
    expect(rotuloDoStatusVisivel('DUPLICADO')).toBe('Duplicado');
  });

  it('só recebido e em andamento estão abertos', () => {
    expect(statusAberto('RECEBIDO')).toBe(true);
    expect(statusAberto('EM_ANDAMENTO')).toBe(true);
    expect(statusAberto('RESOLVIDO')).toBe(false);
    expect(statusAberto('RECUSADO')).toBe(false);
    expect(statusAberto('DUPLICADO')).toBe(false);
  });

  it('usa a mesma classe de selo dos cards do feed', () => {
    expect(classeDoStatus('EM_ANDAMENTO')).toBe('status--em-andamento');
    expect(classeDoStatus('RECUSADO')).toBe('status--recusado');
  });

  it('conta os dias em aberto ou até a resolução, e não conta nas recusadas e duplicadas', () => {
    expect(textoDosDiasVisivel(0, 'RECEBIDO')).toBe('Aberta hoje');
    expect(textoDosDiasVisivel(1, 'EM_ANDAMENTO')).toBe('1 dia em aberto');
    expect(textoDosDiasVisivel(5, 'RECEBIDO')).toBe('5 dias em aberto');
    expect(textoDosDiasVisivel(0, 'RESOLVIDO')).toBe('Resolvido no mesmo dia');
    expect(textoDosDiasVisivel(3, 'RESOLVIDO')).toBe('Resolvido em 3 dias');
    expect(textoDosDiasVisivel(4, 'RECUSADO')).toBeNull();
    expect(textoDosDiasVisivel(4, 'DUPLICADO')).toBeNull();
  });

  it('escreve a data no fuso de Sorocaba', () => {
    // 01:30 em UTC ainda é o dia anterior em Sorocaba.
    expect(dataCurta('2026-11-14T01:30:00.000Z')).toBe('13/11/2026');
  });
});
