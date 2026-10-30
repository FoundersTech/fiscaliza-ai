import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags, ApiUnprocessableEntityResponse } from '@nestjs/swagger';

import { Papel } from '../../identidade/domain/papel.js';
import { Autenticado } from '../../identidade/presentation/autenticacao.js';
import { CriarIntencaoUpload } from '../application/intencao-upload.js';
import { IntencaoUploadDto, IntencaoUploadResposta } from './dto.js';

@ApiTags('midia')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly criarIntencao: CriarIntencaoUpload) {}

  @Post('intencao')
  @Autenticado(Papel.CIDADAO)
  @ApiCreatedResponse({
    type: IntencaoUploadResposta,
    description: 'URL de envio da foto, válida por 5 minutos',
  })
  @ApiUnprocessableEntityResponse({ description: 'FOTO_INVALIDA ou VALIDACAO' })
  async intencao(@Body() dto: IntencaoUploadDto): Promise<IntencaoUploadResposta> {
    return IntencaoUploadResposta.de(
      await this.criarIntencao.executar({
        ocorrenciaId: dto.ocorrencia_id,
        ordem: dto.ordem,
        contentType: dto.content_type,
        bytes: dto.bytes,
      }),
    );
  }
}
