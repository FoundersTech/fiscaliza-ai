import { describe, expect, it, vi } from 'vitest';

import { lerGps, precisaoBaixa, TEMPO_GPS_MS } from './localizacao';

function gpsQue(
  responde: (
    sucesso: PositionCallback,
    falha: PositionErrorCallback,
    opcoes?: PositionOptions,
  ) => void,
) {
  const getCurrentPosition = vi.fn(responde);
  return { geolocalizacao: { getCurrentPosition } as unknown as Geolocation, getCurrentPosition };
}

const POSICAO = {
  coords: { latitude: -23.5015, longitude: -47.4526, accuracy: 8.4 },
} as GeolocationPosition;

describe('lerGps', () => {
  it('pede alta precisão, com 10 s de limite e sem posição guardada', async () => {
    const { geolocalizacao, getCurrentPosition } = gpsQue((sucesso) => sucesso(POSICAO));

    await expect(lerGps(geolocalizacao)).resolves.toEqual({
      ok: true,
      ponto: { lat: -23.5015, lng: -47.4526 },
      precisaoM: 8,
    });
    expect(getCurrentPosition.mock.calls[0]![2]).toEqual({
      enableHighAccuracy: true,
      timeout: TEMPO_GPS_MS,
      maximumAge: 0,
    });
    expect(TEMPO_GPS_MS).toBe(10_000);
  });

  it.each([
    [1, 'NEGADA'],
    [2, 'INDISPONIVEL'],
    [3, 'TEMPO_ESGOTADO'],
  ])('erro %d do navegador vira %s, sem rejeitar', async (code, falha) => {
    const { geolocalizacao } = gpsQue((_sucesso, erro) =>
      erro({ code } as GeolocationPositionError),
    );

    await expect(lerGps(geolocalizacao)).resolves.toEqual({ ok: false, falha });
  });

  it('sem geolocalização no aparelho', async () => {
    await expect(lerGps(undefined)).resolves.toEqual({ ok: false, falha: 'SEM_SUPORTE' });
  });
});

describe('precisaoBaixa', () => {
  it.each([
    [100, false],
    [101, true],
    [null, false],
  ])('%s m: %s', (precisao, baixa) => {
    expect(precisaoBaixa(precisao)).toBe(baixa);
  });
});
