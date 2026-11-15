import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import {
  LEITURA_PUBLICA,
  LimiteTaxa,
  porUsuario,
} from '../../../shared/limite-taxa/limite-taxa.js';
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
  @LimiteTaxa(LEITURA_PUBLICA)
  @ApiOkResponse({ type: ConfigPublicaResposta })
  @ApiServiceUnavailableResponse({ description: 'MUNICIPIO_NAO_CONFIGURADO' })
  async configPublica(): Promise<ConfigPublicaResposta> {
    return ConfigPublicaResposta.de(await this.obterConfigPublica.executar());
  }

  @Get('geo/reverso')
  // Acima do @Autenticado: conta por usuário, que só existe depois do login conferido.
  @LimiteTaxa(porUsuario('geo-reverso', 30, 60))
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({ type: GeoReversoResposta })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async geoReverso(@Query() consulta: GeoReversoQuery): Promise<GeoReversoResposta> {
    return GeoReversoResposta.de(
      await this.consultarPonto.executar({ lat: consulta.lat, lng: consulta.lng }),
    );
  }
}
