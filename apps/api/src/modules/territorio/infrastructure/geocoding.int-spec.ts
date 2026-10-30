import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { opcoesConexaoRedis } from '../../../shared/redis/conexao-redis.js';
import type { GeocodingPort } from '../application/portas.js';
import { GeocodingComCache } from './geocoding-com-cache.js';
import {
  GeocodingNominatimAdapter,
  INTERVALO_NOMINATIM_MS,
} from './geocoding-nominatim.adapter.js';
import { IntervaloRedis } from './intervalo-redis.js';

let redis: Redis;

beforeAll(() => {
  redis = new Redis(opcoesConexaoRedis(process.env.REDIS_URL!));
});

afterAll(() => {
  redis.disconnect();
});

describe('IntervaloRedis', () => {
  it('pedidos simultâneos entram em fila, e quem passaria da espera máxima é recusado', async () => {
    const intervalo = new IntervaloRedis(redis, `teste:intervalo:${randomUUID()}`, 1000);

    const esperas = await Promise.all([
      intervalo.reservar(1500),
      intervalo.reservar(1500),
      intervalo.reservar(1500),
    ]);

    expect(esperas[0]).toBe(0);
    expect(esperas[1]).toBeGreaterThan(950);
    expect(esperas[1]).toBeLessThanOrEqual(1000);
    expect(esperas[2]).toBeNull();
  });
});

describe('Nominatim com cache e intervalo', () => {
  let servidor: Server;
  let url: string;
  const chegadas: number[] = [];

  /** Um Nominatim falso que anota quando cada requisição chega. */
  beforeAll(async () => {
    servidor = createServer((_requisicao, resposta) => {
      chegadas.push(performance.now());
      resposta.setHeader('Content-Type', 'application/json');
      resposta.end(JSON.stringify({ address: { road: 'Rua A', house_number: '1' } }));
    });
    await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolver) => servidor.close(resolver));
  });

  beforeEach(async () => {
    chegadas.length = 0;
    const chaves = await redis.keys('geo:reverso:*');
    if (chaves.length) await redis.del(...chaves);
  });

  function geocoding(chaveIntervalo = `teste:intervalo:${randomUUID()}`): GeocodingPort {
    return new GeocodingComCache(
      redis,
      new GeocodingNominatimAdapter(
        { url, userAgent: 'FiscalizaAi/teste' },
        new IntervaloRedis(redis, chaveIntervalo, INTERVALO_NOMINATIM_MS),
      ),
    );
  }

  it('5 chamadas seguidas chegam ao Nominatim espaçadas em pelo menos 1 s', async () => {
    const consulta = geocoding();

    for (let indice = 0; indice < 5; indice += 1) {
      await consulta.enderecoDe(
        { lat: -23.5 - indice / 100, lng: -47.45 },
        AbortSignal.timeout(2000),
      );
    }

    expect(chegadas).toHaveLength(5);
    const intervalos = chegadas.slice(1).map((chegada, indice) => chegada - chegadas[indice]!);
    for (const intervalo of intervalos) expect(intervalo).toBeGreaterThanOrEqual(1000);
  }, 10_000);

  it('a mesma coordenada, arredondada a 5 casas, é consultada uma vez só e fica 30 dias', async () => {
    const consulta = geocoding();
    const sinal = new AbortController().signal;

    const primeira = await consulta.enderecoDe({ lat: -23.501501, lng: -47.452601 }, sinal);
    const segunda = await consulta.enderecoDe({ lat: -23.501504, lng: -47.452604 }, sinal);

    expect(primeira).toEqual({ rua: 'Rua A', numero: '1', bairro: null });
    expect(segunda).toEqual(primeira);
    expect(chegadas).toHaveLength(1);
    const validade = await redis.ttl('geo:reverso:-23.50150,-47.45260');
    expect(validade).toBeGreaterThan(29 * 24 * 60 * 60);
  });

  it('ponto sem endereço também fica guardado; falha não fica', async () => {
    const origem = {
      enderecoDe: vi
        .fn<GeocodingPort['enderecoDe']>()
        .mockRejectedValueOnce(new Error('503'))
        .mockResolvedValue(null),
    };
    const consulta = new GeocodingComCache(redis, origem);
    const ponto = { lat: -23.4, lng: -47.4 };
    const sinal = new AbortController().signal;

    await expect(consulta.enderecoDe(ponto, sinal)).rejects.toThrow('503');
    expect(await consulta.enderecoDe(ponto, sinal)).toBeNull();
    expect(await consulta.enderecoDe(ponto, sinal)).toBeNull();
    expect(origem.enderecoDe).toHaveBeenCalledTimes(2);
  });
});
