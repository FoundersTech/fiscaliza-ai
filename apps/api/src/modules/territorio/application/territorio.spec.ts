import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PartesEndereco } from '../domain/endereco.js';
import type { GeocodingPort, RepositorioTerritorio, Territorio } from './portas.js';
import {
  ConsultarPonto,
  EnderecoReverso,
  LIMITE_GEOCODING_MS,
  ResolverTerritorio,
} from './territorio.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };
const SOROCABA: Territorio = { municipioId: 3552205, municipioSigla: 'SOR', orgaoId: 1 };

function geocodingQueResponde(partes: PartesEndereco | null) {
  return { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>().mockResolvedValue(partes) };
}

/** Só responde quando a consulta é cancelada, como um servidor que não responde. */
function geocodingLento() {
  return {
    enderecoDe: vi.fn<GeocodingPort['enderecoDe']>(
      (_ponto, sinal) =>
        new Promise((_resolver, rejeitar) => {
          sinal.addEventListener('abort', () => rejeitar(new Error('cancelada')));
        }),
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('EnderecoReverso', () => {
  it('traz o bairro quando o geocodificador o informa', async () => {
    const geocoding = geocodingQueResponde({
      rua: 'Rua Quinze de Novembro',
      numero: '482',
      bairro: 'Centro',
    });

    expect(await new EnderecoReverso(geocoding).executar(CENTRO)).toBe(
      'Rua Quinze de Novembro, 482 · Centro',
    );
    expect(geocoding.enderecoDe).toHaveBeenCalledWith(CENTRO, expect.any(AbortSignal));
  });

  it('só rua e número quando o geocodificador não informa o bairro', async () => {
    const geocoding = geocodingQueResponde({
      rua: 'Rua Quinze de Novembro',
      numero: '482',
      bairro: null,
    });

    expect(await new EnderecoReverso(geocoding).executar(CENTRO)).toBe(
      'Rua Quinze de Novembro, 482',
    );
  });

  it('um geocodificador que demora mais de 2 s dá endereço null, sem erro, e é cancelado', async () => {
    vi.useFakeTimers();
    const geocoding = geocodingLento();

    const resultado = new EnderecoReverso(geocoding).executar(CENTRO);
    await vi.advanceTimersByTimeAsync(LIMITE_GEOCODING_MS - 1);
    const sinal = geocoding.enderecoDe.mock.calls[0]![1];
    expect(sinal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultado).resolves.toBeNull();
    expect(sinal.aborted).toBe(true);
  });

  it('falha do geocodificador ou ponto sem endereço dão null', async () => {
    const quebrado = { enderecoDe: vi.fn().mockRejectedValue(new Error('503')) };

    expect(await new EnderecoReverso(quebrado).executar(CENTRO)).toBeNull();
    expect(await new EnderecoReverso(geocodingQueResponde(null)).executar(CENTRO)).toBeNull();
  });
});

describe('ConsultarPonto', () => {
  function montar(territorio: Territorio | null) {
    const repositorio = { localizar: vi.fn().mockResolvedValue(territorio) };
    const geocoding = geocodingQueResponde({ rua: 'Rua A', numero: '1', bairro: null });
    const consultar = new ConsultarPonto(
      new ResolverTerritorio(repositorio as unknown as RepositorioTerritorio),
      new EnderecoReverso(geocoding),
    );
    return { consultar, geocoding };
  }

  it('dentro da área, devolve o endereço', async () => {
    const { consultar } = montar(SOROCABA);

    expect(await consultar.executar(CENTRO)).toEqual({ endereco: 'Rua A, 1', dentroDaArea: true });
  });

  it('fora da área, nem consulta o geocodificador', async () => {
    const { consultar, geocoding } = montar(null);

    expect(await consultar.executar({ lat: -23.5505, lng: -46.6333 })).toEqual({
      endereco: null,
      dentroDaArea: false,
    });
    expect(geocoding.enderecoDe).not.toHaveBeenCalled();
  });
});
