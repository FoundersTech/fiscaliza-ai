import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import type { GeocodingPort } from '../application/portas.js';
import type { PartesEndereco, Ponto } from '../domain/endereco.js';

const PREFIXO = 'geo:reverso:';
const VALIDADE_SEGUNDOS = 30 * 24 * 60 * 60;
const CASAS = 5;

/**
 * Guarda no Redis o endereço de cada coordenada arredondada, por 30 dias. O arredondamento vale
 * também para a consulta ao geocodificador. Sem Redis, consulta direto.
 */
export class GeocodingComCache implements GeocodingPort {
  private readonly logger = new Logger(GeocodingComCache.name);

  constructor(
    private readonly redis: Redis,
    private readonly origem: GeocodingPort,
  ) {}

  async enderecoDe(ponto: Ponto, sinal: AbortSignal): Promise<PartesEndereco | null> {
    const lat = ponto.lat.toFixed(CASAS);
    const lng = ponto.lng.toFixed(CASAS);
    const chave = `${PREFIXO}${lat},${lng}`;

    const guardado = await this.ler(chave);
    if (guardado !== undefined) return guardado;

    const partes = await this.origem.enderecoDe({ lat: Number(lat), lng: Number(lng) }, sinal);
    await this.gravar(chave, partes);
    return partes;
  }

  private async ler(chave: string): Promise<PartesEndereco | null | undefined> {
    try {
      const texto = await this.redis.get(chave);
      return texto === null
        ? undefined
        : (JSON.parse(texto) as { partes: PartesEndereco | null }).partes;
    } catch (erro) {
      this.logger.warn(`Cache de endereços indisponível: ${String(erro)}`);
      return undefined;
    }
  }

  private async gravar(chave: string, partes: PartesEndereco | null): Promise<void> {
    try {
      await this.redis.set(chave, JSON.stringify({ partes }), 'EX', VALIDADE_SEGUNDOS);
    } catch (erro) {
      this.logger.warn(`Cache de endereços indisponível: ${String(erro)}`);
    }
  }
}
