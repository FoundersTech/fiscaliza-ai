import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

import { LimiteTaxa, type RegraLimiteTaxa } from '../../../shared/limite-taxa/limite-taxa.js';
import { ObterPainel } from '../application/obter-painel.js';
import { PainelQuery, PainelResposta } from './dto-painel.js';

/** Leituras públicas: 120 por minuto por IP, no mesmo limite do feed e do mapa. */
const LEITURA_PUBLICA: RegraLimiteTaxa = {
  nome: 'leitura-publica',
  maximo: 120,
  janelaSegundos: 60,
  chave: ({ ip }) => ip,
};

/** Indicadores públicos, abertos a visitantes. */
@ApiTags('indicadores')
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly obterPainel: ObterPainel) {}

  @Get('painel')
  @LimiteTaxa(LEITURA_PUBLICA)
  @ApiOkResponse({ type: PainelResposta })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (período, município ou categoria)' })
  async painel(@Query() consulta: PainelQuery): Promise<PainelResposta> {
    return PainelResposta.de(
      await this.obterPainel.executar({
        municipioId: consulta.municipio ?? null,
        periodoDias: consulta.periodo ?? null,
        categorias: consulta.categoria ?? null,
      }),
    );
  }
}
