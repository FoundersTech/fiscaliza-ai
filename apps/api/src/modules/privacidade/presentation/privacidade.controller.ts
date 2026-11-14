import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { LimiteTaxa } from '../../../shared/limite-taxa/limite-taxa.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import {
  limparCookieRefresh,
  type RespostaHttp,
} from '../../identidade/presentation/cookie-refresh.js';
import { ExcluirConta } from '../application/excluir-conta.js';
import {
  ConsultarExportacoes,
  exportacaoNaoEncontrada,
  SolicitarExportacao,
} from '../application/exportacoes.js';
import { ExcluirContaDto, ExportacaoCriadaResposta, ExportacaoResposta } from './dto.js';

@ApiTags('me')
@Controller('me')
export class PrivacidadeController {
  constructor(
    private readonly solicitarExportacao: SolicitarExportacao,
    private readonly consultarExportacoes: ConsultarExportacoes,
    private readonly excluirConta: ExcluirConta,
  ) {}

  @Post('exportacoes')
  @HttpCode(HttpStatus.ACCEPTED)
  @Autenticado(Papel.CIDADAO)
  @ApiAcceptedResponse({
    type: ExportacaoCriadaResposta,
    description:
      'Exportação dos dados pedida; o arquivo é gerado em segundo plano. Se já há uma em andamento ou pronta para baixar, devolve essa mesma.',
  })
  async exportar(@UsuarioAtual() usuario: DadosToken): Promise<ExportacaoCriadaResposta> {
    const exportacao = await this.solicitarExportacao.executar(usuario.usuarioId);
    return { id: exportacao.id, status: exportacao.status };
  }

  @Get('exportacoes')
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({
    type: [ExportacaoResposta],
    description: 'As últimas exportações do usuário, das mais recentes para as mais antigas.',
  })
  async exportacoes(@UsuarioAtual() usuario: DadosToken): Promise<ExportacaoResposta[]> {
    const lista = await this.consultarExportacoes.listar(usuario.usuarioId);
    return lista.map((situacao) => ExportacaoResposta.de(situacao));
  }

  @Get('exportacoes/:id')
  @Autenticado(Papel.CIDADAO)
  @ApiOkResponse({ type: ExportacaoResposta })
  @ApiNotFoundResponse({ description: 'EXPORTACAO_NAO_ENCONTRADA (inclusive a de outra pessoa)' })
  async exportacao(
    @Param('id', new ParseUUIDPipe({ exceptionFactory: exportacaoNaoEncontrada })) id: string,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<ExportacaoResposta> {
    return ExportacaoResposta.de(await this.consultarExportacoes.obter(usuario.usuarioId, id));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Autenticado(Papel.CIDADAO)
  @LimiteTaxa({ nome: 'excluir-conta', maximo: 5, janelaSegundos: 900, chave: ({ ip }) => ip })
  @ApiNoContentResponse({
    description:
      'Conta anonimizada, sessões encerradas e cookie de refresh apagado. As ocorrências continuam públicas, sem autor.',
  })
  @ApiUnauthorizedResponse({ description: 'SENHA_INCORRETA' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO' })
  async excluir(
    @UsuarioAtual() usuario: DadosToken,
    @Body() dto: ExcluirContaDto,
    @Res({ passthrough: true }) resposta: RespostaHttp,
  ): Promise<void> {
    await this.excluirConta.executar(usuario.usuarioId, dto.senha);
    limparCookieRefresh(resposta);
  }
}
