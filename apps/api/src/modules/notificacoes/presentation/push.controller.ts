import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado, UsuarioAtual } from '../../identidade/presentation/autenticacao.js';
import { CancelarPush, InscreverPush } from '../application/push.js';
import { CancelarPushDto, InscricaoPushDto } from './dto-push.js';

/** Inscrições de Web Push do navegador do cidadão. */
@ApiTags('notificacoes')
@Controller('me/push')
@Autenticado(Papel.CIDADAO)
export class PushController {
  constructor(
    private readonly inscrever: InscreverPush,
    private readonly cancelar: CancelarPush,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({
    description:
      'Inscrição gravada. Reenviar o mesmo endpoint atualiza as chaves e passa a inscrição para a conta atual.',
  })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (endpoint ou chaves inválidos)' })
  async criar(@Body() dto: InscricaoPushDto, @UsuarioAtual() usuario: DadosToken): Promise<void> {
    await this.inscrever.executar(usuario.usuarioId, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Inscrição removida, ou já não existia' })
  @ApiUnprocessableEntityResponse({ description: 'VALIDACAO (endpoint inválido)' })
  async remover(@Body() dto: CancelarPushDto, @UsuarioAtual() usuario: DadosToken): Promise<void> {
    await this.cancelar.executar(usuario.usuarioId, dto.endpoint);
  }
}
