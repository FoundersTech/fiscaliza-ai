import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { REDIS } from '../../../shared/redis/redis.module.js';
import type { CachePainel, PainelCalculado } from '../application/portas.js';

/** Quanto tempo um painel calculado vale. */
export const VALIDADE_CACHE_PAINEL_SEGUNDOS = 5 * 60;

/** Painel guardado no Redis por 5 minutos. Sem Redis, o painel é calculado a cada pedido. */
@Injectable()
export class CachePainelRedis implements CachePainel {
  private readonly logger = new Logger(CachePainelRedis.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async ler(chave: string): Promise<PainelCalculado | undefined> {
    try {
      const texto = await this.redis.get(chave);
      if (texto === null) return undefined;
      const guardado = JSON.parse(texto) as Omit<PainelCalculado, 'calculadoEm'> & {
        calculadoEm: string;
      };
      return { ...guardado, calculadoEm: new Date(guardado.calculadoEm) };
    } catch (erro) {
      this.logger.warn(`Cache do painel indisponível: ${String(erro)}`);
      return undefined;
    }
  }

  async gravar(chave: string, painel: PainelCalculado): Promise<void> {
    try {
      await this.redis.set(chave, JSON.stringify(painel), 'EX', VALIDADE_CACHE_PAINEL_SEGUNDOS);
    } catch (erro) {
      this.logger.warn(`Cache do painel indisponível: ${String(erro)}`);
    }
  }
}
