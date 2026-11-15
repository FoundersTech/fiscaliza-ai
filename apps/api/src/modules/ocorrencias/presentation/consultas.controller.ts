import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LEITURA_PUBLICA, LimiteTaxa } from '../../../shared/limite-taxa/limite-taxa.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import {
  AutenticacaoOpcional,
  Autenticado,
  UsuarioAtual,
  UsuarioOpcional,
} from '../../identidade/presentation/autenticacao.js';
import { ocorrenciaNaoEncontrada } from '../application/confirmar-ocorrencia.js';
import { ListarFeed } from '../application/listar-feed.js';
import { ListarMapa } from '../application/listar-mapa.js';
import { ListarMinhas } from '../application/listar-minhas.js';
import { ObterDetalhe } from '../application/obter-detalhe.js';
import {
  DetalheResposta,
  FeedQuery,
  FeedResposta,
  LIMITE_PADRAO_FEED,
  MapaQuery,
  MapaResposta,
  MinhasQuery,
  MinhasResposta,
} from './dto-consultas.js';

/** Feed, mapa e detalhe: abertos a visitantes, só com ocorrências visíveis ao público. */
@ApiTags('ocorrencias')
@Controller('ocorrencias')
export class ConsultasController {
  constructor(
    private readonly listarFeed: ListarFeed,
    private readonly listarMapa: ListarMapa,
    private readonly obterDetalhe: ObterDetalhe,
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

  // Depois de 'mapa', para /ocorrencias/mapa não cair aqui.
  @Get(':id')
  @LimiteTaxa(LEITURA_PUBLICA)
  @AutenticacaoOpcional()
  @ApiOkResponse({
    type: DetalheResposta,
    description: 'Com token, vêm também os campos pessoais (pode_confirmar, pode_avaliar…)',
  })
  @ApiNotFoundResponse({
    description: 'NAO_ENCONTRADA: id inexistente, inválido, ou recusada/duplicada de outra pessoa',
  })
  async detalhe(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: ocorrenciaNaoEncontrada })) id: string,
    @UsuarioOpcional() usuario: DadosToken | null,
  ): Promise<DetalheResposta> {
    const leitor = usuario && { usuarioId: usuario.usuarioId, papel: usuario.papel };
    return DetalheResposta.deDetalhe(await this.obterDetalhe.executar(id, leitor));
  }
}

/** "Minhas ocorrências": todas as do cidadão logado, inclusive recusadas e duplicadas. */
@ApiTags('ocorrencias')
@Controller('me/ocorrencias')
export class MinhasOcorrenciasController {
  constructor(private readonly listarMinhas: ListarMinhas) {}

  @Get()
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({ type: MinhasResposta, description: 'Da mais recente para a mais antiga' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (limite ou cursor inválido)' })
  async minhas(
    @Query() consulta: MinhasQuery,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<MinhasResposta> {
    return MinhasResposta.de(
      await this.listarMinhas.executar({
        autorId: usuario.usuarioId,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite ?? LIMITE_PADRAO_FEED,
      }),
    );
  }
}
