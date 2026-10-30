import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsUUID } from 'class-validator';

import type { IntencaoUpload } from '../application/intencao-upload.js';
import { ORDENS_FOTO, type OrdemFoto, TAMANHO_MAXIMO_FOTO, TIPO_FOTO } from '../domain/foto.js';

/** Tipo e tamanho fora da regra dão 422 FOTO_INVALIDA, não VALIDACAO. */
export class IntencaoUploadDto {
  @ApiProperty({ format: 'uuid', description: 'Id da ocorrência, gerado no aparelho' })
  @IsUUID('all', { message: 'informe o id da ocorrência (UUID)' })
  ocorrencia_id!: string;

  @ApiProperty({ enum: ORDENS_FOTO, description: 'Posição da foto na ocorrência' })
  @IsIn(ORDENS_FOTO, { message: 'a ordem deve ser 1 ou 2' })
  ordem!: OrdemFoto;

  @ApiProperty({ example: TIPO_FOTO })
  @IsString({ message: 'informe o tipo da foto' })
  content_type!: string;

  @ApiProperty({
    maximum: TAMANHO_MAXIMO_FOTO,
    description: 'Tamanho exato do arquivo: o PUT com outro tamanho é recusado',
  })
  @IsInt({ message: 'informe o tamanho da foto em bytes' })
  bytes!: number;
}

export class IntencaoUploadResposta {
  @ApiProperty({ description: 'PUT com os headers Content-Type e Content-Length do pedido' })
  upload_url!: string;

  @ApiProperty({ example: 'ocorrencias/0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21/1-….jpg' })
  upload_key!: string;

  @ApiProperty({ format: 'date-time' })
  expira_em!: string;

  static de(intencao: IntencaoUpload): IntencaoUploadResposta {
    return {
      upload_url: intencao.uploadUrl,
      upload_key: intencao.uploadKey,
      expira_em: intencao.expiraEm.toISOString(),
    };
  }
}
