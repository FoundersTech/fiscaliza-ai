import { setTimeout as esperar } from 'node:timers/promises';

import { z } from 'zod';

import type { GeocodingPort } from '../application/portas.js';
import type { PartesEndereco, Ponto } from '../domain/endereco.js';
import type { Intervalo } from './intervalo-redis.js';

/**
 * O servidor público aceita 1 requisição por segundo; a folga de 100 ms cobre a variação da
 * rede. Quem já tem uma consulta na frente espera a vez; com duas, o endereço fica para depois.
 */
export const INTERVALO_NOMINATIM_MS = 1100;
const ESPERA_MAXIMA_MS = 1200;

// O Nominatim usa chaves diferentes conforme o tipo de via.
const CHAVES_RUA = ['road', 'pedestrian', 'footway', 'path', 'square'] as const;
const CHAVES_BAIRRO = ['suburb', 'neighbourhood'] as const;

const esquemaResposta = z.object({ address: z.record(z.string(), z.string()).optional() });

export interface ConfigNominatim {
  url: string;
  userAgent: string;
}

/** Endereço reverso pela API do Nominatim (OpenStreetMap), uma requisição por vez. */
export class GeocodingNominatimAdapter implements GeocodingPort {
  constructor(
    private readonly config: ConfigNominatim,
    private readonly intervalo: Intervalo,
  ) {}

  async enderecoDe(ponto: Ponto, sinal: AbortSignal): Promise<PartesEndereco | null> {
    const espera = await this.intervalo.reservar(ESPERA_MAXIMA_MS);
    if (espera === null) throw new Error('fila do Nominatim cheia');
    if (espera > 0) await esperar(espera, undefined, { signal: sinal });

    const url = new URL(`${this.config.url}/reverse`);
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(ponto.lat),
      lon: String(ponto.lng),
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'pt-BR',
    }).toString();

    const resposta = await fetch(url, {
      headers: { 'User-Agent': this.config.userAgent, Accept: 'application/json' },
      signal: sinal,
    });
    if (!resposta.ok) throw new Error(`Nominatim respondeu ${resposta.status}`);

    // Sem endereço (no meio do mar, por exemplo), a resposta é { error: "Unable to geocode" }.
    const { address } = esquemaResposta.parse(await resposta.json());
    if (!address) return null;

    const primeira = (chaves: readonly string[]) =>
      chaves.map((chave) => address[chave]).find(Boolean) ?? null;
    return {
      rua: primeira(CHAVES_RUA),
      numero: address['house_number'] ?? null,
      bairro: primeira(CHAVES_BAIRRO),
    };
  }
}
