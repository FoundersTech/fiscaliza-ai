import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type Alerta,
  agendarConsultaAlertas,
  rotuloAcessivelAlertas,
  rotuloDoIndicador,
  textoDoAlerta,
} from './alertas';

function alerta(mudancas: Partial<Alerta>): Alerta {
  return {
    evento_id: 1,
    ocorrencia_id: 'ocorrencia-1',
    protocolo: 'FA-2026-SOR-000001',
    para_status_publico: 'EM_ANDAMENTO',
    reaberta: false,
    criado_em: '2026-11-14T12:00:00.000Z',
    ...mudancas,
  };
}

describe('textos dos alertas', () => {
  it('diz o novo status, e a reabertura tem texto próprio', () => {
    expect(textoDoAlerta(alerta({}))).toBe('Está em andamento na prefeitura.');
    expect(textoDoAlerta(alerta({ para_status_publico: 'RESOLVIDO' }))).toBe(
      'Foi resolvida pela prefeitura.',
    );
    expect(textoDoAlerta(alerta({ para_status_publico: 'RECUSADO' }))).toMatch(/recusada/);
    expect(textoDoAlerta(alerta({ reaberta: true }))).toMatch(/reaberta/);
  });

  it('o indicador some com zero e passa de 9 como "9+"', () => {
    expect(rotuloDoIndicador(0)).toBeNull();
    expect(rotuloDoIndicador(3)).toBe('3');
    expect(rotuloDoIndicador(12)).toBe('9+');
    expect(rotuloAcessivelAlertas(0)).toBe('Alertas');
    expect(rotuloAcessivelAlertas(1)).toBe('Alertas, 1 novo');
    expect(rotuloAcessivelAlertas(4)).toBe('Alertas, 4 novos');
  });
});

describe('consulta a cada minuto', () => {
  afterEach(() => vi.useRealTimers());

  it('consulta ao começar e a cada 60 s, até parar', () => {
    vi.useFakeTimers();
    const consultar = vi.fn();
    const parar = agendarConsultaAlertas({ consultar });
    expect(consultar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    vi.advanceTimersByTime(60_000);
    expect(consultar).toHaveBeenCalledTimes(3);

    parar();
    vi.advanceTimersByTime(120_000);
    expect(consultar).toHaveBeenCalledTimes(3);
  });
});
