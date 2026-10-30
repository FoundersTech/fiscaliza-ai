import type { components } from '@fiscaliza/contratos';

import type { Ponto } from './localizacao';

export type Categoria = components['schemas']['CategoriaResposta'];
export type CampoAtributo = components['schemas']['CampoAtributoResposta'];
/** Como os campos guardam o que foi digitado: número vazio é null. */
export type ValoresAtributos = Record<string, string | number | null | undefined>;

export const MAX_FOTOS = 2;
export const DESCRICAO_MIN = 10;
export const DESCRICAO_MAX = 500;

export const TOTAL_PASSOS = 3;

function vazio(valor: string | number | null | undefined): boolean {
  return valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim());
}

/** As mesmas regras da API para os campos extras da categoria. */
export function problemaDoAtributo(
  campo: CampoAtributo,
  valor: string | number | null | undefined,
): string | null {
  if (vazio(valor)) return campo.obrigatorio ? `${campo.rotulo} é obrigatório` : null;

  switch (campo.tipo) {
    case 'texto': {
      const max = campo.max ?? Infinity;
      return String(valor).trim().length <= max
        ? null
        : `${campo.rotulo} aceita até ${max} caracteres`;
    }
    case 'numero': {
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return `${campo.rotulo} deve ser um número`;
      }
      const min = campo.min ?? -Infinity;
      const max = campo.max ?? Infinity;
      return valor >= min && valor <= max
        ? null
        : `${campo.rotulo} deve estar entre ${campo.min} e ${campo.max}`;
    }
    case 'opcao':
      return typeof valor === 'string' && (campo.opcoes ?? []).includes(valor)
        ? null
        : `Escolha uma opção de ${campo.rotulo}`;
  }
}

export function problemaDaDescricao(descricao: string): string | null {
  const tamanho = descricao.trim().length;
  if (tamanho < DESCRICAO_MIN) return `Descreva com pelo menos ${DESCRICAO_MIN} caracteres`;
  if (tamanho > DESCRICAO_MAX) return `A descrição aceita até ${DESCRICAO_MAX} caracteres`;
  return null;
}

export function passoFotosCompleto(quantidade: number): boolean {
  return quantidade >= 1 && quantidade <= MAX_FOTOS;
}

export function passoDescricaoCompleto(
  categoria: Categoria | null,
  descricao: string,
  atributos: ValoresAtributos,
): boolean {
  return (
    categoria !== null &&
    problemaDaDescricao(descricao) === null &&
    categoria.schema_atributos.every((campo) => !problemaDoAtributo(campo, atributos[campo.chave]))
  );
}

/** O que vai no POST: textos sem espaços nas pontas e sem os opcionais vazios. */
export function atributosParaEnvio(
  categoria: Categoria,
  atributos: ValoresAtributos,
): Record<string, string | number> {
  const envio: Record<string, string | number> = {};
  for (const campo of categoria.schema_atributos) {
    const valor = atributos[campo.chave];
    if (vazio(valor)) continue;
    envio[campo.chave] = typeof valor === 'string' ? valor.trim() : (valor as number);
  }
  return envio;
}

/** De onde veio o ponto. CENTRO é o centro do município, posto quando não há GPS. */
export type OrigemPonto = 'GPS' | 'MAPA' | 'CENTRO';

export interface EstadoLocal {
  ponto: Ponto | null;
  origem: OrigemPonto | null;
  /** null quando a consulta falhou: quem decide é a API, no envio. */
  dentroDaArea: boolean | null;
  consultando: boolean;
}

/** O pino no centro do município ainda não foi posto por ninguém: precisa ser movido. */
export function passoLocalCompleto(local: EstadoLocal): boolean {
  return (
    local.ponto !== null &&
    local.origem !== 'CENTRO' &&
    !local.consultando &&
    local.dentroDaArea !== false
  );
}
