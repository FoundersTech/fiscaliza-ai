import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado } from '../../identidade/presentation/autenticacao.js';
import { ObterConfigPublica } from '../application/config-publica.js';
import { ConsultarPonto } from '../application/territorio.js';
import { ConfigPublicaResposta, GeoReversoQuery, GeoReversoResposta } from './dto.js';

@ApiTags('territorio')
@Controller()
export class TerritorioController {
  constructor(
    private readonly obterConfigPublica: ObterConfigPublica,
    private readonly consultarPonto: ConsultarPonto,
  ) {}

  @Get('config/publica')
  @ApiOkResponse({ type: ConfigPublicaResposta })
  @ApiServiceUnavailableResponse({ description: 'MUNICIPIO_NAO_CONFIGURADO' })
  async configPublica(): Promise<ConfigPublicaResposta> {
    return ConfigPublicaResposta.de(await this.obterConfigPublica.executar());
  }

  @Get('geo/reverso')
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({ type: GeoReversoResposta })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async geoReverso(@Query() consulta: GeoReversoQuery): Promise<GeoReversoResposta> {
    return GeoReversoResposta.de(
      await this.consultarPonto.executar({ lat: consulta.lat, lng: consulta.lng }),
    );
  }
}
