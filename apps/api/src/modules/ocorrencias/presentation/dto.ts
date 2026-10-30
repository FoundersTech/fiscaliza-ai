import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import type { Registro } from '../application/registrar-ocorrencia.js';
import { StatusOcorrencia } from '../domain/ocorrencia.js';

const ORIGENS = ['ONLINE', 'OFFLINE'] as const;
const TAMANHO_CHAVE = 200;

const aparar = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class LocalDto {
  @ApiProperty({ example: -23.5015 })
  @IsLatitude({ message: 'informe uma latitude válida' })
  lat!: number;

  @ApiProperty({ example: -47.4526 })
  @IsLongitude({ message: 'informe uma longitude válida' })
  lng!: number;
}

export class FotoDto {
  @ApiProperty({ description: 'A upload_key devolvida por POST /uploads/intencao' })
  @IsString({ message: 'informe a chave da foto' })
  @MaxLength(TAMANHO_CHAVE, { message: 'chave de foto inválida' })
  upload_key!: string;

  @ApiProperty({ enum: [1, 2] })
  @IsIn([1, 2], { message: 'a ordem deve ser 1 ou 2' })
  ordem!: number;
}

export class RegistroDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Gerado no aparelho; reenviar o mesmo id não duplica',
  })
  @IsUUID('all', { message: 'informe o id da ocorrência (UUID)' })
  id!: string;

  @ApiProperty({ example: 2 })
  @IsInt({ message: 'escolha uma categoria' })
  @Min(1, { message: 'escolha uma categoria' })
  categoria_id!: number;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @aparar
  @IsString({ message: 'descreva o problema' })
  @Length(10, 500, { message: 'a descrição deve ter de 10 a 500 caracteres' })
  descricao!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    description: 'Campos extras da categoria (schema_atributos)',
  })
  @IsOptional()
  @IsObject({ message: 'envie os atributos como objeto' })
  atributos?: Record<string, string | number>;

  @ApiProperty({ type: LocalDto })
  @ValidateNested()
  @Type(() => LocalDto)
  local!: LocalDto;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Precisão do GPS em metros; null quando o pino foi posto à mão',
  })
  @IsOptional()
  @IsInt({ message: 'a precisão deve ser um número inteiro de metros' })
  @Min(0, { message: 'a precisão não pode ser negativa' })
  @Max(32767, { message: 'precisão inválida' })
  precisao_m?: number | null;

  @ApiPropertyOptional({ default: false, description: 'Mostrar o apelido do autor na ocorrência' })
  @IsOptional()
  @IsBoolean({ message: 'publicar_autor deve ser verdadeiro ou falso' })
  publicar_autor?: boolean;

  @ApiProperty({ type: [FotoDto], minItems: 1, maxItems: 2 })
  @IsArray({ message: 'envie de 1 a 2 fotos' })
  @ArrayMinSize(1, { message: 'envie de 1 a 2 fotos' })
  @ArrayMaxSize(2, { message: 'envie de 1 a 2 fotos' })
  @ValidateNested({ each: true })
  @Type(() => FotoDto)
  fotos!: FotoDto[];

  @ApiProperty({
    enum: ORIGENS,
    description: 'OFFLINE: pendente enviada depois; não passa pela duplicidade',
  })
  @IsIn(ORIGENS, { message: 'a origem deve ser ONLINE ou OFFLINE' })
  origem!: (typeof ORIGENS)[number];

  @ApiPropertyOptional({
    default: false,
    description: 'Criar mesmo com candidatas a duplicata ("É outro problema")',
  })
  @IsOptional()
  @IsBoolean({ message: 'forcar_criacao deve ser verdadeiro ou falso' })
  forcar_criacao?: boolean;
}

export class OcorrenciaCriadaResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'FA-2026-SOR-000123' })
  protocolo!: string;

  @ApiProperty({ enum: Object.values(StatusOcorrencia) })
  status!: StatusOcorrencia;

  static de({ ocorrencia }: Registro): OcorrenciaCriadaResposta {
    return { id: ocorrencia.id, protocolo: ocorrencia.protocolo, status: ocorrencia.status };
  }
}

export class CandidataDuplicidadeResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'FA-2026-SOR-000045' })
  protocolo!: string;

  @ApiProperty({ description: 'Começo da descrição' })
  resumo!: string;

  @ApiProperty({ example: 42 })
  distancia_m!: number;

  @ApiProperty({ example: 3 })
  confirmacoes!: number;
}

class DetalhesDuplicidade {
  @ApiProperty({ type: [CandidataDuplicidadeResposta], description: 'Até 3, da mais próxima' })
  candidatas!: CandidataDuplicidadeResposta[];
}

export class ErroDuplicidadeResposta {
  @ApiProperty({ enum: ['DUPLICATA_POSSIVEL', 'ID_EM_USO'] })
  codigo!: string;

  @ApiProperty()
  mensagem!: string;

  @ApiProperty({ type: DetalhesDuplicidade, description: 'Vazio no ID_EM_USO' })
  detalhes!: DetalhesDuplicidade;
}
