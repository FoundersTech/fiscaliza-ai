import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

import { type Perfil, type Sessao } from '../application/perfil.js';
import { PAPEIS, type Papel } from '../domain/papel.js';
import { SENHA_MAX, SENHA_MIN } from '../domain/senha.js';

const TAMANHO_EMAIL = 254;

const aparar = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

/** Corpo do POST /auth/cadastro. Qualquer outro campo, como `papel`, é recusado com 422. */
export class CadastroDto {
  @ApiProperty({ example: 'Maria da Silva', minLength: 2, maxLength: 100 })
  @aparar
  @IsString({ message: 'informe o nome' })
  @Length(2, 100, { message: 'o nome deve ter de 2 a 100 caracteres' })
  nome!: string;

  @ApiProperty({
    example: 'maria.s',
    minLength: 2,
    maxLength: 30,
    description: 'Nome que aparece nas ocorrências, se o cidadão quiser',
  })
  @aparar
  @IsString({ message: 'informe o apelido público' })
  @Length(2, 30, { message: 'o apelido deve ter de 2 a 30 caracteres' })
  apelido_publico!: string;

  @ApiProperty({ example: 'maria@exemplo.com', maxLength: TAMANHO_EMAIL })
  @aparar
  @IsEmail({}, { message: 'informe um e-mail válido' })
  @MaxLength(TAMANHO_EMAIL, { message: `o e-mail aceita até ${TAMANHO_EMAIL} caracteres` })
  email!: string;

  @ApiProperty({ minLength: SENHA_MIN, maxLength: SENHA_MAX, format: 'password' })
  @IsString({ message: 'informe a senha' })
  @Length(SENHA_MIN, SENHA_MAX, {
    message: `a senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres`,
  })
  senha!: string;

  @ApiProperty({ example: '1', description: 'Versão da política de privacidade aceita' })
  @IsString({ message: 'informe a versão da política aceita' })
  @IsNotEmpty({ message: 'informe a versão da política aceita' })
  politica_versao!: string;
}

/** Corpo do POST /auth/login. Sem regra de formato: qualquer erro vira o mesmo 401. */
export class LoginDto {
  @ApiProperty({ example: 'maria@exemplo.com' })
  @aparar
  @IsString({ message: 'informe o e-mail' })
  @IsNotEmpty({ message: 'informe o e-mail' })
  @MaxLength(TAMANHO_EMAIL, { message: `o e-mail aceita até ${TAMANHO_EMAIL} caracteres` })
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString({ message: 'informe a senha' })
  @IsNotEmpty({ message: 'informe a senha' })
  @MaxLength(SENHA_MAX, { message: `a senha aceita até ${SENHA_MAX} caracteres` })
  senha!: string;
}

export class PerfilResposta {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  apelido_publico!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: PAPEIS })
  papel!: Papel;

  @ApiProperty({ type: Number, nullable: true })
  municipio_id!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  orgao_id!: number | null;

  @ApiProperty({ description: 'O PWA bloqueia o uso até o aceite da política vigente' })
  precisa_aceitar_politica!: boolean;

  static de(perfil: Perfil): PerfilResposta {
    return {
      id: perfil.id,
      nome: perfil.nome,
      apelido_publico: perfil.apelidoPublico,
      email: perfil.email,
      papel: perfil.papel,
      municipio_id: perfil.municipioId,
      orgao_id: perfil.orgaoId,
      precisa_aceitar_politica: perfil.precisaAceitarPolitica,
    };
  }
}

export class SessaoResposta {
  @ApiProperty({ description: 'JWT de 15 minutos, enviado no header Authorization: Bearer' })
  access_token!: string;

  @ApiProperty({ type: PerfilResposta })
  usuario!: PerfilResposta;

  static de(sessao: Sessao): SessaoResposta {
    return { access_token: sessao.accessToken, usuario: PerfilResposta.de(sessao.usuario) };
  }
}
