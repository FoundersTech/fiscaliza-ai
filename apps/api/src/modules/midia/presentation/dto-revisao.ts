import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

import type { FotoRevisada, PaginaRevisao } from '../application/revisao-fotos.js';
import { ModeracaoFoto } from '../domain/foto.js';

export const LIMITE_PADRAO_REVISAO = 30;
export const LIMITE_MAXIMO_REVISAO = 100;

const MODERACOES = Object.values(ModeracaoFoto);

const inteiro = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
);

export class RevisaoFotosQuery {
  @ApiPropertyOptional({ enum: MODERACOES, default: ModeracaoFoto.APROVADA })
  @IsOptional()
  @IsIn(MODERACOES, { message: `a moderação deve ser ${MODERACOES.join(', ')}` })
  moderacao?: ModeracaoFoto;

  @ApiPropertyOptional({ description: 'O proximo_cursor da página anterior' })
  @IsOptional()
  @IsUUID('all', { message: 'cursor inválido; recomece pela primeira página' })
  cursor?: string;

  @ApiPropertyOptional({
    default: LIMITE_PADRAO_REVISAO,
    minimum: 1,
    maximum: LIMITE_MAXIMO_REVISAO,
  })
  @IsOptional()
  @inteiro
  @IsInt({ message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_REVISAO}` })
  @Min(1, { message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_REVISAO}` })
  @Max(LIMITE_MAXIMO_REVISAO, {
    message: `o limite deve ser um número de 1 a ${LIMITE_MAXIMO_REVISAO}`,
  })
  limite?: number;
}

/** Corpo do POST /admin/fotos/:id/rejeicao. */
export class RejeicaoFotoDto {
  @ApiProperty({ example: 'Mostra o rosto de uma pessoa', minLength: 3, maxLength: 500 })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'informe o motivo' })
  @Length(3, 500, { message: 'o motivo deve ter de 3 a 500 caracteres' })
  motivo!: string;
}

export class FotoRevisaoResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ocorrencia_id!: string;

  @ApiProperty({ example: 'FA-2026-SOR-000123' })
  protocolo!: string;

  @ApiProperty({ enum: [1, 2] })
  ordem!: number;

  @ApiProperty({ enum: MODERACOES })
  moderacao!: ModeracaoFoto;

  @ApiProperty({ type: String, nullable: true, description: 'Só da foto aprovada' })
  url!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Só da foto aprovada' })
  miniatura_url!: string | null;

  @ApiProperty({ type: String, nullable: true })
  motivo_rejeicao!: string | null;

  @ApiProperty({ format: 'date-time' })
  criada_em!: string;

  static de(foto: FotoRevisada): FotoRevisaoResposta {
    return {
      id: foto.id,
      ocorrencia_id: foto.ocorrenciaId,
      protocolo: foto.protocolo,
      ordem: foto.ordem,
      moderacao: foto.moderacao,
      url: foto.url,
      miniatura_url: foto.miniaturaUrl,
      motivo_rejeicao: foto.motivoRejeicao,
      criada_em: foto.criadaEm.toISOString(),
    };
  }
}

export class RevisaoFotosResposta {
  @ApiProperty({ type: [FotoRevisaoResposta] })
  itens!: FotoRevisaoResposta[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Passe em ?cursor= para a página seguinte; null na última',
  })
  proximo_cursor!: string | null;

  static de(pagina: PaginaRevisao): RevisaoFotosResposta {
    return {
      itens: pagina.itens.map((foto) => FotoRevisaoResposta.de(foto)),
      proximo_cursor: pagina.proximoCursor,
    };
  }
}
