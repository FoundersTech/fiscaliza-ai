import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ObterPainel } from './application/obter-painel.js';
import { ObterScore } from './application/obter-score.js';
import { CACHE_PAINEL, CONSULTAS_PAINEL, DESEMPENHO_ORGAOS } from './application/portas.js';
import { FILA_INDICADORES, RecalcularScore } from './application/recalcular-score.js';
import { AgendaIndicadores } from './infrastructure/agenda-indicadores.js';
import { CachePainelRedis } from './infrastructure/cache-painel.redis.js';
import { ConsultasPainelPrisma } from './infrastructure/consultas-painel.prisma.js';
import { DesempenhoOrgaosPrisma } from './infrastructure/desempenho-orgaos.prisma.js';
import { IndicadoresProcessor } from './infrastructure/indicadores.processor.js';
import { IndicadoresController } from './presentation/indicadores.controller.js';

/**
 * Indicadores públicos de desempenho: o painel, calculado na hora a partir das ocorrências,
 * e o score dos órgãos, recalculado por um job agendado.
 */
@Module({
  imports: [BullModule.registerQueue({ name: FILA_INDICADORES })],
  controllers: [IndicadoresController],
  providers: [
    ObterPainel,
    ObterScore,
    RecalcularScore,
    AgendaIndicadores,
    IndicadoresProcessor,
    { provide: CONSULTAS_PAINEL, useClass: ConsultasPainelPrisma },
    { provide: CACHE_PAINEL, useClass: CachePainelRedis },
    { provide: DESEMPENHO_ORGAOS, useClass: DesempenhoOrgaosPrisma },
  ],
})
export class IndicadoresModule {}
