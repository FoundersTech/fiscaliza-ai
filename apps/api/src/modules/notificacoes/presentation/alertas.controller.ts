import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import { LIMITE_PADRAO_FEED } from '../../ocorrencias/presentation/dto-consultas.js';
import { ContarAlertasNovos, ListarAlertas, MarcarAlertasVistos } from '../application/alertas.js';
import { AlertasNovosResposta, AlertasQuery, AlertasResposta } from './dto-alertas.js';

/** Aba Alertas: mudanças de status das ocorrências que o cidadão registrou ou confirmou. */
@ApiTags('notificacoes')
@Controller('me/alertas')
@Autenticado(Papel.CIDADAO)
export class AlertasController {
  constructor(
    private readonly listarAlertas: ListarAlertas,
    private readonly contarNovos: ContarAlertasNovos,
    private readonly marcarVistos: MarcarAlertasVistos,
  ) {}

  @Get()
  @ApiOkResponse({ type: AlertasResposta, description: 'Do mais recente para o mais antigo' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (limite ou cursor inválido)' })
  async listar(
    @Query() consulta: AlertasQuery,
    @UsuarioAtual() usuario: DadosToken,
  ): Promise<AlertasResposta> {
    return AlertasResposta.de(
      await this.listarAlertas.executar({
        usuarioId: usuario.usuarioId,
        cursor: consulta.cursor ?? null,
        limite: consulta.limite ?? LIMITE_PADRAO_FEED,
      }),
    );
  }

  @Get('novos')
  @ApiOkResponse({ type: AlertasNovosResposta })
  async novos(@UsuarioAtual() usuario: DadosToken): Promise<AlertasNovosResposta> {
    return { quantidade: await this.contarNovos.executar(usuario.usuarioId) };
  }

  @Post('vistos')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Zera o indicador de alertas novos' })
  async vistos(@UsuarioAtual() usuario: DadosToken): Promise<void> {
    await this.marcarVistos.executar(usuario.usuarioId);
  }
}
