/**
 * Regra de negócio violada na camada de domínio. Não conhece HTTP: a camada de apresentação
 * converte o `codigo` para o status e o formato { codigo, mensagem, detalhes } da API.
 */
export class ErroDominio extends Error {
  override readonly name = 'ErroDominio';

  constructor(
    readonly codigo: string,
    mensagem: string,
    readonly detalhes: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}
