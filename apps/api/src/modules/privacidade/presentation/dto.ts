import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { SENHA_MAX } from '../../identidade/domain/senha.js';
import type { SituacaoExportacao } from '../application/exportacoes.js';
import { STATUS_EXPORTACAO, type StatusExportacao } from '../domain/exportacao.js';

/** Corpo do DELETE /me. */
export class ExcluirContaDto {
  @ApiProperty({ format: 'password', description: 'Senha atual, para confirmar a exclusão' })
  @IsString({ message: 'informe a senha' })
  @IsNotEmpty({ message: 'informe a senha' })
  @MaxLength(SENHA_MAX, { message: `a senha aceita até ${SENHA_MAX} caracteres` })
  senha!: string;
}

export class ExportacaoCriadaResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: STATUS_EXPORTACAO, enumName: 'StatusExportacao' })
  status!: StatusExportacao;
}

export class ExportacaoResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: STATUS_EXPORTACAO,
    enumName: 'StatusExportacao',
    description: 'Pronta com o prazo vencido já aparece como EXPIRADA',
  })
  status!: StatusExportacao;

  @ApiProperty({ format: 'date-time' })
  solicitada_em!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  pronta_em?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'O arquivo some 7 dias depois de pronto',
  })
  expira_em?: string;

  @ApiPropertyOptional({
    description: 'Só quando PRONTA. Link do arquivo JSON, válido por 15 minutos.',
  })
  download_url?: string;

  static de(situacao: SituacaoExportacao): ExportacaoResposta {
    return {
      id: situacao.id,
      status: situacao.status,
      solicitada_em: situacao.solicitadaEm.toISOString(),
      ...(situacao.prontaEm ? { pronta_em: situacao.prontaEm.toISOString() } : {}),
      ...(situacao.expiraEm ? { expira_em: situacao.expiraEm.toISOString() } : {}),
      ...(situacao.downloadUrl ? { download_url: situacao.downloadUrl } : {}),
    };
  }
}
