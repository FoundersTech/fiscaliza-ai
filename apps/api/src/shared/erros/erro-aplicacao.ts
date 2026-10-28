/**
 * Erro esperado da aplicação (regra violada, recurso inexistente etc.).
 * O FiltroErros o converte para HTTP no formato { codigo, mensagem, detalhes }.
 */
export class ErroAplicacao extends Error {
  override readonly name = 'ErroAplicacao';

  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly status: number,
    readonly detalhes: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}
