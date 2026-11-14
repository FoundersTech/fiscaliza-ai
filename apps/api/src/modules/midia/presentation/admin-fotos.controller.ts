import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado } from '../../identidade/presentation/autenticacao.js';
import {
  erroFotoNaoEncontrada,
  ListarFotosParaRevisao,
  RejeitarFoto,
} from '../application/revisao-fotos.js';
import { ModeracaoFoto } from '../domain/foto.js';
import {
  LIMITE_PADRAO_REVISAO,
  RejeicaoFotoDto,
  RevisaoFotosQuery,
  RevisaoFotosResposta,
} from './dto-revisao.js';

@ApiTags('administracao')
@Controller('admin/fotos')
@Autenticado(Papel.ADMIN_PLATAFORMA)
export class AdminFotosController {
  constructor(
    private readonly listarFotos: ListarFotosParaRevisao,
    private readonly rejeitarFoto: RejeitarFoto,
  ) {}

  @Get()
  @ApiOkResponse({ type: RevisaoFotosResposta, description: 'Das mais recentes às mais antigas' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async listar(@Query() consulta: RevisaoFotosQuery): Promise<RevisaoFotosResposta> {
    return RevisaoFotosResposta.de(
      await this.listarFotos.executar({
        moderacao: consulta.moderacao ?? ModeracaoFoto.APROVADA,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite ?? LIMITE_PADRAO_REVISAO,
      }),
    );
  }

  @Post(':id/rejeicao')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description:
      'A foto some das telas públicas na hora, e ela e a miniatura são apagadas do bucket público. Repetir o pedido não muda o motivo.',
  })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({ description: 'FOTO_EM_ANALISE: a foto ainda não foi processada' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async rejeitar(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: erroFotoNaoEncontrada })) id: string,
    @Body() dto: RejeicaoFotoDto,
  ): Promise<void> {
    await this.rejeitarFoto.executar(id, dto.motivo);
  }
}
