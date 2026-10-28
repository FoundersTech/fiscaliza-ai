import type { z } from 'zod';

/** Configuração inválida: a API não sobe e a mensagem aponta cada campo errado. */
export class ErroConfiguracao extends Error {
  override readonly name = 'ErroConfiguracao';
}

export function formatarProblemas(origem: string, problemas: readonly z.core.$ZodIssue[]): string {
  const linhas = problemas.map((problema) => {
    const campo = problema.path.length > 0 ? problema.path.map(String).join('.') : '(raiz)';
    return `  - ${campo}: ${problema.message}`;
  });
  return [`${origem} inválido:`, ...linhas].join('\n');
}
