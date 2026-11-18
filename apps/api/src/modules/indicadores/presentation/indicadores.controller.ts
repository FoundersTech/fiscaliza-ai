import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LEITURA_PUBLICA, LimiteTaxa } from '../../../shared/limite-taxa/limite-taxa.js';
import { ObterPainel } from '../application/obter-painel.js';
import { ObterScore } from '../application/obter-score.js';
import { PainelQuery, PainelResposta } from './dto-painel.js';
import { ScoreQuery, ScoreResposta } from './dto-score.js';

/** Indicadores públicos, abertos a visitantes, no mesmo limite de leitura do feed e do mapa. */
@ApiTags('indicadores')
@Controller('indicadores')
export class IndicadoresController {
  constructor(
    private readonly obterPainel: ObterPainel,
    private readonly obterScore: ObterScore,
  ) {}

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

  /** O último score calculado pelo job; não recalcula na hora. */
  @Get('score')
  @LimiteTaxa(LEITURA_PUBLICA)
  @ApiOkResponse({ type: ScoreResposta })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADO (município sem órgão ativo)' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (município)' })
  async score(@Query() consulta: ScoreQuery): Promise<ScoreResposta> {
    return ScoreResposta.de(await this.obterScore.executar(consulta.municipio ?? null));
  }
}
