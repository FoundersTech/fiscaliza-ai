import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

import type { Agente, Gestor, Orgao } from '../application/portas.js';

const TAMANHO_EMAIL = 254;

const aparar = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/** Corpo do PATCH /admin/orgao: só os campos enviados mudam. */
export class EdicaoOrgaoDto {
  @ApiPropertyOptional({ example: 'Prefeitura de Sorocaba', minLength: 2, maxLength: 100 })
  @IsOptional()
  @aparar
  @IsString({ message: 'informe o nome do órgão' })
  @Length(2, 100, { message: 'o nome deve ter de 2 a 100 caracteres' })
  nome?: string;

  @ApiPropertyOptional({ example: 'PMS', minLength: 2, maxLength: 10 })
  @IsOptional()
  @aparar
  @IsString({ message: 'informe a sigla do órgão' })
  @Matches(/^[A-Z0-9]{2,10}$/, {
    message: 'a sigla deve ter de 2 a 10 letras maiúsculas ou números',
  })
  sigla?: string;
}

/** Nome e e-mail de quem recebe o convite. */
export class ConviteDto {
  @ApiProperty({ example: 'João Pereira', minLength: 2, maxLength: 100 })
  @aparar
  @IsString({ message: 'informe o nome' })
  @Length(2, 100, { message: 'o nome deve ter de 2 a 100 caracteres' })
  nome!: string;

  @ApiProperty({ example: 'joao@sorocaba.sp.gov.br', maxLength: TAMANHO_EMAIL })
  @aparar
  @IsEmail({}, { message: 'informe um e-mail válido' })
  @MaxLength(TAMANHO_EMAIL, { message: `o e-mail aceita até ${TAMANHO_EMAIL} caracteres` })
  email!: string;
}

/** Corpo do PATCH /admin/agentes/:id. */
export class AlteracaoAgenteDto {
  @ApiProperty({ description: 'false desativa o agente e encerra todas as sessões dele' })
  @IsBoolean({ message: 'ativo deve ser verdadeiro ou falso' })
  ativo!: boolean;
}

/** Corpo do POST /admin/gestores. */
export class ConviteGestorDto extends ConviteDto {
  @ApiProperty({ example: 3552205, description: 'Código IBGE do município' })
  @IsInt({ message: 'informe o município' })
  municipio_id!: number;
}

export class OrgaoResposta {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  municipio_id!: number;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  sigla!: string;

  static de(orgao: Orgao): OrgaoResposta {
    return { id: orgao.id, municipio_id: orgao.municipioId, nome: orgao.nome, sigla: orgao.sigla };
  }
}

export class AgenteResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  ativo!: boolean;

  @ApiProperty({ description: 'Ainda não definiu a senha pelo link do convite' })
  convite_pendente!: boolean;

  static de(agente: Agente): AgenteResposta {
    return {
      id: agente.id,
      nome: agente.nome,
      email: agente.email,
      ativo: agente.ativo,
      convite_pendente: agente.convitePendente,
    };
  }
}

export class GestorResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  municipio_id!: number;

  static de(gestor: Gestor): GestorResposta {
    return {
      id: gestor.id,
      nome: gestor.nome,
      email: gestor.email,
      municipio_id: gestor.municipioId,
    };
  }
}
