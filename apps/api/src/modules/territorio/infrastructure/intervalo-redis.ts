import type { Redis } from 'ioredis';

/**
 * Reserva o próximo horário livre e devolve quanto esperar até ele, em ms, ou -1 se a espera
 * passaria do máximo (aí nada é reservado). O relógio é o do Redis, o mesmo para todos os
 * processos da API.
 */
const SCRIPT_RESERVAR = `
local relogio = redis.call('TIME')
local agora = tonumber(relogio[1]) * 1000 + math.floor(tonumber(relogio[2]) / 1000)
local intervalo = tonumber(ARGV[1])
local inicio = math.max(agora, tonumber(redis.call('GET', KEYS[1]) or '0'))
local espera = inicio - agora
if espera > tonumber(ARGV[2]) then return -1 end
redis.call('SET', KEYS[1], inicio + intervalo, 'PX', espera + intervalo)
return espera
`;

/** Fila de chamadas a um serviço que aceita no máximo uma requisição por intervalo. */
export interface Intervalo {
  /** Quanto esperar antes de chamar, ou null se a fila passaria da espera máxima. */
  reservar(esperaMaximaMs: number): Promise<number | null>;
}

export class IntervaloRedis implements Intervalo {
  constructor(
    private readonly redis: Redis,
    private readonly chave: string,
    private readonly intervaloMs: number,
  ) {}

  async reservar(esperaMaximaMs: number): Promise<number | null> {
    const espera = Number(
      await this.redis.eval(SCRIPT_RESERVAR, 1, this.chave, this.intervaloMs, esperaMaximaMs),
    );
    return espera < 0 ? null : espera;
  }
}
