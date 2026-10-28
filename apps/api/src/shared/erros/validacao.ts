import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/** Junta os erros do class-validator em { "campo.subcampo": ["mensagem", ...] }. */
export function mapearCampos(erros: ValidationError[], prefixo = ''): Record<string, string[]> {
  const campos: Record<string, string[]> = {};

  for (const erro of erros) {
    const caminho = prefixo ? `${prefixo}.${erro.property}` : erro.property;
    if (erro.constraints) {
      campos[caminho] = Object.values(erro.constraints);
    }
    if (erro.children?.length) {
      Object.assign(campos, mapearCampos(erro.children, caminho));
    }
  }

  return campos;
}

/** Validação global dos DTOs: campos extras são recusados e o erro sai como 422 VALIDACAO. */
export function criarPipeValidacao(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (erros) =>
      new UnprocessableEntityException({
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos.',
        detalhes: { campos: mapearCampos(erros) },
      }),
  });
}
