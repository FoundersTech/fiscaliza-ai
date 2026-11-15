import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import { ListarFilaOrgao, ObterDetalheAtendimento } from '../application/atendimento.js';
import { ocorrenciaNaoEncontrada } from '../application/confirmar-ocorrencia.js';
import { type Agente, TransicionarStatus } from '../application/transicionar-status.js';
import { LIMITE_PADRAO_FEED } from './dto-consultas.js';
import {
  DetalheAtendimentoResposta,
  FilaQuery,
  FilaResposta,
  TransicaoDto,
  TransicaoResposta,
} from './dto-atendimento.js';

function agenteDe(usuario: DadosToken): Agente {
  return { usuarioId: usuario.usuarioId, orgaoId: usuario.orgaoId };
}

const ID = new ParseUUIDPipe({ exceptionFactory: ocorrenciaNaoEncontrada });

/** Atendimento pelo órgão: a fila, o detalhe com os eventos e as mudanças de status. */
@ApiTags('atendimento')
@Controller('atendimento/ocorrencias')
@Autenticado(Papel.AGENTE_ORGAO)
@ApiForbiddenResponse({ description: 'OUTRO_ORGAO, ACESSO_NEGADO (só AGENTE_ORGAO)' })
export class AtendimentoController {
  constructor(
    private readonly listarFila: ListarFilaOrgao,
    private readonly obterDetalhe: ObterDetalheAtendimento,
    private readonly transicionarStatus: TransicionarStatus,
  ) {}

  @Get()
  @ApiOkResponse({
    type: FilaResposta,
    description: 'Só as do órgão do agente, da mais antiga para a mais recente',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (filtro, limite ou cursor inválido)' })
  async fila(
    @Query() consulta: FilaQuery,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<FilaResposta> {
    return FilaResposta.de(
      await this.listarFila.executar({
        agente: agenteDe(usuario),
        status: consulta.status ?? null,
        categorias: consulta.categoria ?? null,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite ?? LIMITE_PADRAO_FEED,
      }),
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: DetalheAtendimentoResposta })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  async detalhe(
    @Param('id', ID) id: string,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<DetalheAtendimentoResposta> {
    return DetalheAtendimentoResposta.deAtendimento(
      await this.obterDetalhe.executar(id, agenteDe(usuario)),
    );
  }

  @Post(':id/transicoes')
  @HttpCode(200)
  @ApiOkResponse({ type: TransicaoResposta, description: 'Status alterado e evento gravado' })
  @ApiNotFoundResponse({ description: 'NAO_ENCONTRADA' })
  @ApiConflictResponse({
    description: 'CONFLITO_STATUS: o status já não é o status_esperado (recarregue a tela)',
  })
  @ApiUnprocessableEntityResponse({
    description: 'TRANSICAO_INVALIDA, COMENTARIO_OBRIGATORIO, ORIGINAL_INVALIDA ou VALIDACAO',
  })
  async transicionar(
    @Param('id', ID) id: string,
    @Body() dto: TransicaoDto,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<TransicaoResposta> {
    return TransicaoResposta.de(
      await this.transicionarStatus.executar({
        ocorrenciaId: id,
        agente: agenteDe(usuario),
        statusEsperado: dto.status_esperado,
        paraStatus: dto.para_status,
        comentario: dto.comentario ?? null,
        protocoloOriginal: dto.protocolo_original ?? null,
      }),
    );
  }
}
