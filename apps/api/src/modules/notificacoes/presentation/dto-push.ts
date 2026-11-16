import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const TAMANHO_ENDPOINT = 2048;
const TAMANHO_CHAVE = 256;

/** O endpoint da `PushSubscription`: o endereço do serviço de push daquele navegador. */
function Endpoint(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      example: 'https://fcm.googleapis.com/fcm/send/abc123',
      maxLength: TAMANHO_ENDPOINT,
      description: 'Endereço do serviço de push do navegador',
    }),
    IsUrl(
      { protocols: ['https', 'http'], require_protocol: true, require_tld: false },
      { message: 'informe o endpoint da inscrição (URL http ou https)' },
    ),
    MaxLength(TAMANHO_ENDPOINT, { message: 'endpoint muito longo' }),
  );
}

/** As chaves de criptografia da inscrição, como saem de `PushSubscription.toJSON()`. */
export class ChavesPushDto {
  @ApiProperty({ description: 'Chave pública ECDH do navegador (base64url)' })
  @IsString({ message: 'informe a chave p256dh' })
  @IsNotEmpty({ message: 'informe a chave p256dh' })
  @MaxLength(TAMANHO_CHAVE, { message: 'chave p256dh inválida' })
  p256dh!: string;

  @ApiProperty({ description: 'Segredo de autenticação do navegador (base64url)' })
  @IsString({ message: 'informe a chave auth' })
  @IsNotEmpty({ message: 'informe a chave auth' })
  @MaxLength(TAMANHO_CHAVE, { message: 'chave auth inválida' })
  auth!: string;
}

/** Corpo do POST /me/push: o JSON da `PushSubscription` do navegador. */
export class InscricaoPushDto {
  @Endpoint()
  endpoint!: string;

  @ApiProperty({ type: ChavesPushDto })
  @IsObject({ message: 'informe as chaves da inscrição' })
  @ValidateNested()
  @Type(() => ChavesPushDto)
  keys!: ChavesPushDto;
}

/** Corpo do DELETE /me/push. Só o endpoint importa; o resto da inscrição é aceito e ignorado. */
export class CancelarPushDto {
  @Endpoint()
  endpoint!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Ignorado; aceito para o PWA poder mandar a PushSubscription inteira',
  })
  @IsOptional()
  @IsObject({ message: 'envie as chaves como objeto' })
  keys?: Record<string, unknown>;
}
