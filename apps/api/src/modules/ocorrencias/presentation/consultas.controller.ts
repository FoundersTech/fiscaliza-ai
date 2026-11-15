import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

import { LimiteTaxa, type RegraLimiteTaxa } from '../../../shared/limite-taxa/limite-taxa.js';
import { ListarFeed } from '../application/listar-feed.js';
import { ListarMapa } from '../application/listar-mapa.js';
import {
  FeedQuery,
  FeedResposta,
  LIMITE_PADRAO_FEED,
  MapaQuery,
  MapaResposta,
} from './dto-consultas.js';

/** Leituras públicas: 120 por minuto por IP. */
const LEITURA_PUBLICA: RegraLimiteTaxa = {
  nome: 'leitura-publica',
  maximo: 120,
  janelaSegundos: 60,
  chave: ({ ip }) => ip,
};

/** Feed e mapa: abertos a visitantes, só com ocorrências visíveis ao público. */
@ApiTags('ocorrencias')
@Controller('ocorrencias')
export class ConsultasController {
  constructor(
    private readonly listarFeed: ListarFeed,
    private readonly listarMapa: ListarMapa,
  ) {}

  @Get()
  @LimiteTaxa(LEITURA_PUBLICA)
  @ApiOkResponse({ type: FeedResposta, description: 'Da mais recente para a mais antiga' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (filtro, limite ou cursor inválido)' })
  async feed(@Query() consulta: FeedQuery): Promise<FeedResposta> {
    return FeedResposta.de(
      await this.listarFeed.executar({
        municipioId: consulta.municipio ?? null,
        status: consulta.status ?? null,
        categorias: consulta.categoria ?? null,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite ?? LIMITE_PADRAO_FEED,
      }),
    );
  }

  @Get('mapa')
  @LimiteTaxa(LEITURA_PUBLICA)
  @ApiOkResponse({ type: MapaResposta })
  @ApiUnprocessableEntityResponse({
    description: 'BBOX_INVALIDA (área ausente ou malformada) ou VALIDACAO (filtro inválido)',
  })
  async mapa(@Query() consulta: MapaQuery): Promise<MapaResposta> {
    return MapaResposta.de(
      await this.listarMapa.executar({
        bbox: consulta.bbox ?? null,
        municipioId: consulta.municipio ?? null,
        status: consulta.status ?? null,
        categorias: consulta.categoria ?? null,
      }),
    );
  }
}
