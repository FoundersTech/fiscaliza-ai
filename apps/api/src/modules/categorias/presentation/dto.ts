import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { CampoAtributoResposta } from '../../territorio/presentation/dto.js';
import type { Categoria } from '../application/portas.js';

/** Prazo máximo aceito no cadastro, em dias. */
export const SLA_MAXIMO_DIAS = 365;

const aparar = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/** Corpo do POST /admin/categorias. */
export class NovaCategoriaDto {
  @ApiProperty({ example: 'iluminacao', pattern: '^[a-z0-9-]{2,40}$' })
  @aparar
  @IsString({ message: 'informe o slug' })
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'o slug deve ter de 2 a 40 letras minúsculas, números ou hífens',
  })
  slug!: string;

  @ApiProperty({ example: 'Iluminação', minLength: 2, maxLength: 60 })
  @aparar
  @IsString({ message: 'informe o nome' })
  @Length(2, 60, { message: 'o nome deve ter de 2 a 60 caracteres' })
  nome!: string;

  @ApiProperty({ example: 'lightbulb', description: 'Nome de um ícone do Material Icons' })
  @aparar
  @IsString({ message: 'informe o ícone' })
  @Matches(/^[a-z0-9_]{2,60}$/, { message: 'use o nome de um ícone do Material Icons' })
  icone!: string;

  @ApiProperty({ example: 15, minimum: 1, maximum: SLA_MAXIMO_DIAS, description: 'Prazo em dias' })
  @IsInt({ message: 'o prazo deve ser um número inteiro de dias' })
  @Min(1, { message: 'o prazo deve ser maior que 0' })
  @Max(SLA_MAXIMO_DIAS, { message: `o prazo aceita até ${SLA_MAXIMO_DIAS} dias` })
  sla_dias!: number;

  @ApiProperty({
    type: [CampoAtributoResposta],
    description: 'Campos extras do registro. Pode ser vazio.',
  })
  @IsArray({ message: 'envie a lista de campos extras (pode ser vazia)' })
  schema_atributos!: unknown[];

  @ApiPropertyOptional({ default: true, description: 'false tira a categoria do registro' })
  @IsOptional()
  @IsBoolean({ message: 'ativa deve ser verdadeiro ou falso' })
  ativa?: boolean;
}

/** Corpo do PATCH /admin/categorias/:id: só os campos enviados mudam. */
export class EdicaoCategoriaDto extends PartialType(NovaCategoriaDto) {}

export class CategoriaAdminResposta {
  @ApiProperty()
  id!: number;

  @ApiProperty({ example: 'iluminacao' })
  slug!: string;

  @ApiProperty({ example: 'Iluminação' })
  nome!: string;

  @ApiProperty({ example: 'lightbulb' })
  icone!: string;

  @ApiProperty({ example: 15 })
  sla_dias!: number;

  @ApiProperty({ type: [CampoAtributoResposta] })
  schema_atributos!: CampoAtributoResposta[];

  @ApiProperty()
  ativa!: boolean;

  static de(categoria: Categoria): CategoriaAdminResposta {
    return {
      id: categoria.id,
      slug: categoria.slug,
      nome: categoria.nome,
      icone: categoria.icone,
      sla_dias: categoria.slaDias,
      schema_atributos: categoria.schemaAtributos,
      ativa: categoria.ativa,
    };
  }
}
