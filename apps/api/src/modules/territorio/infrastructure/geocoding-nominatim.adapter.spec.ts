import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeocodingNominatimAdapter } from './geocoding-nominatim.adapter.js';
import type { Intervalo } from './intervalo-redis.js';

const PONTO = { lat: -23.5015, lng: -47.4526 };
const CONFIG = {
  url: 'https://nominatim.exemplo.test',
  userAgent: 'FiscalizaAi/teste (+https://app.exemplo.test)',
};

function intervaloLivre(espera: number | null = 0) {
  return { reservar: vi.fn<Intervalo['reservar']>().mockResolvedValue(espera) };
}

function responder(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(Response.json(corpo, { status }));
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GeocodingNominatimAdapter', () => {
  it('pede o endereço reverso em pt-BR, identificando o app', async () => {
    const fetchFalso = responder({ address: { road: 'Rua A' } });

    await new GeocodingNominatimAdapter(CONFIG, intervaloLivre()).enderecoDe(
      PONTO,
      new AbortController().signal,
    );

    const [url, requisicao] = fetchFalso.mock.calls[0]!;
    const enviada = url as URL;
    expect(enviada.origin + enviada.pathname).toBe('https://nominatim.exemplo.test/reverse');
    expect(Object.fromEntries(enviada.searchParams)).toEqual({
      format: 'jsonv2',
      lat: '-23.5015',
      lon: '-47.4526',
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'pt-BR',
    });
    expect(requisicao?.headers).toMatchObject({ 'User-Agent': CONFIG.userAgent });
  });

  it('lê rua, número e bairro (suburb ou, sem ele, neighbourhood)', async () => {
    const adapter = new GeocodingNominatimAdapter(CONFIG, intervaloLivre());
    const sinal = new AbortController().signal;

    responder({
      address: { house_number: '482', road: 'Rua Quinze de Novembro', suburb: 'Centro' },
    });
    expect(await adapter.enderecoDe(PONTO, sinal)).toEqual({
      rua: 'Rua Quinze de Novembro',
      numero: '482',
      bairro: 'Centro',
    });

    responder({ address: { pedestrian: 'Calçadão', neighbourhood: 'Vila Hortência' } });
    expect(await adapter.enderecoDe(PONTO, sinal)).toEqual({
      rua: 'Calçadão',
      numero: null,
      bairro: 'Vila Hortência',
    });
  });

  it('ponto sem endereço dá null; erro HTTP lança erro', async () => {
    const adapter = new GeocodingNominatimAdapter(CONFIG, intervaloLivre());
    const sinal = new AbortController().signal;

    responder({ error: 'Unable to geocode' });
    expect(await adapter.enderecoDe(PONTO, sinal)).toBeNull();

    responder({}, 503);
    await expect(adapter.enderecoDe(PONTO, sinal)).rejects.toThrow('Nominatim respondeu 503');
  });

  it('com a fila cheia, falha sem chamar o Nominatim', async () => {
    const fetchFalso = responder({ address: {} });

    await expect(
      new GeocodingNominatimAdapter(CONFIG, intervaloLivre(null)).enderecoDe(
        PONTO,
        new AbortController().signal,
      ),
    ).rejects.toThrow('fila do Nominatim cheia');
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('espera a vez reservada antes de chamar', async () => {
    const fetchFalso = responder({ address: {} });
    const inicio = performance.now();

    await new GeocodingNominatimAdapter(CONFIG, intervaloLivre(60)).enderecoDe(
      PONTO,
      new AbortController().signal,
    );

    expect(fetchFalso).toHaveBeenCalledOnce();
    expect(performance.now() - inicio).toBeGreaterThanOrEqual(55);
  });
});
