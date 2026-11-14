import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { agendarSincronizacao, avisoDeSaida, conviteParaEntrar } from './sincronizacao';

describe('agendarSincronizacao', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sincroniza ao abrir, quando a conexão volta e a cada 60 s com conexão', () => {
    const sincronizar = vi.fn();
    const janela = new EventTarget();
    let online = true;

    const parar = agendarSincronizacao({ sincronizar, janela, online: () => online });
    expect(sincronizar).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(sincronizar).toHaveBeenCalledTimes(2);

    online = false;
    vi.advanceTimersByTime(120_000);
    expect(sincronizar).toHaveBeenCalledTimes(2);

    online = true;
    janela.dispatchEvent(new Event('online'));
    expect(sincronizar).toHaveBeenCalledTimes(3);

    parar();
    janela.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(120_000);
    expect(sincronizar).toHaveBeenCalledTimes(3);
  });
});

describe('textos das pendentes', () => {
  it('aviso ao sair da conta', () => {
    expect(avisoDeSaida(0)).toBeNull();
    expect(avisoDeSaida(1)).toBe('Você tem 1 ocorrência não enviada. Sair vai descartá-la.');
    expect(avisoDeSaida(3)).toBe('Você tem 3 ocorrências não enviadas. Sair vai descartá-las.');
  });

  it('convite para entrar', () => {
    expect(conviteParaEntrar(0)).toBeNull();
    expect(conviteParaEntrar(1)).toBe('Entre para enviar sua ocorrência');
    expect(conviteParaEntrar(2)).toBe('Entre para enviar suas 2 ocorrências');
  });
});
