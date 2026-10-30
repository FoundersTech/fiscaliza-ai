export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

type Regra = (valor: string) => true | string;

export function obrigatorio(mensagem: string): Regra {
  return (valor) => valor.trim().length > 0 || mensagem;
}

export function tamanho(min: number, max: number, mensagem: string): Regra {
  return (valor) => (valor.trim().length >= min && valor.trim().length <= max) || mensagem;
}

export const emailValido: Regra = (valor) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim()) || 'Informe um e-mail válido';

/** A senha não é aparada: espaços contam, como na API. */
export const senhaValida: Regra = (valor) =>
  (valor.length >= SENHA_MIN && valor.length <= SENHA_MAX) ||
  `A senha deve ter de ${SENHA_MIN} a ${SENHA_MAX} caracteres`;

export function igualA(outro: () => string, mensagem: string): Regra {
  return (valor) => valor === outro() || mensagem;
}
