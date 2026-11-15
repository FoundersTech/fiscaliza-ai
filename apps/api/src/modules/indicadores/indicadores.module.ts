import { Module } from '@nestjs/common';

import { ObterPainel } from './application/obter-painel.js';
import { CACHE_PAINEL, CONSULTAS_PAINEL } from './application/portas.js';
import { CachePainelRedis } from './infrastructure/cache-painel.redis.js';
import { ConsultasPainelPrisma } from './infrastructure/consultas-painel.prisma.js';
import { IndicadoresController } from './presentation/indicadores.controller.js';

/** Indicadores públicos de desempenho: o painel, calculado na hora a partir das ocorrências. */
@Module({
  controllers: [IndicadoresController],
  providers: [
    ObterPainel,
    { provide: CONSULTAS_PAINEL, useClass: ConsultasPainelPrisma },
    { provide: CACHE_PAINEL, useClass: CachePainelRedis },
  ],
})
export class IndicadoresModule {}
