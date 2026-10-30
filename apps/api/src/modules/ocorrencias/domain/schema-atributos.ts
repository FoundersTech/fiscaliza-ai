import { z } from 'zod';

import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';

/**
 * Campos extras de uma categoria e a validação dos
 * `atributos` de uma ocorrência contra eles.
 */

const base = {
  chave: z.string().regex(/^[a-z_]{2,30}$/, 'use de 2 a 30 letras minúsculas ou _'),
  rotulo: z.string().trim().min(1, 'o rótulo é obrigatório'),
  obrigatorio: z.boolean(),
};

const esquemaCampo = z.discriminatedUnion('tipo', [
  z.strictObject({ ...base, tipo: z.literal('texto'), max: z.int().positive() }),
  z
    .strictObject({ ...base, tipo: z.literal('numero'), min: z.number(), max: z.number() })
    .refine((campo) => campo.min <= campo.max, { message: 'min maior que max', path: ['min'] }),
  z.strictObject({
    ...base,
    tipo: z.literal('opcao'),
    opcoes: z
      .array(z.string().trim().min(1))
      .min(1, 'informe ao menos uma opção')
      .refine((opcoes) => new Set(opcoes).size === opcoes.length, 'há opções repetidas'),
  }),
]);

const esquemaLista = z.array(esquemaCampo).superRefine((campos, contexto) => {
  const vistas = new Set<string>();
  campos.forEach((campo, indice) => {
    if (vistas.has(campo.chave)) {
      contexto.addIssue({
        code: 'custom',
        message: `chave repetida: ${campo.chave}`,
        path: [indice, 'chave'],
      });
    }
    vistas.add(campo.chave);
  });
});

export type CampoAtributo = z.output<typeof esquemaCampo>;
export type ValorAtributo = string | number;
export type Atributos = Record<string, ValorAtributo>;

export class SchemaAtributos {
  private constructor(readonly campos: readonly CampoAtributo[]) {}

  /** Valida o schema de uma categoria (PATCH de categoria → SCHEMA_INVALIDO). */
  static criar(json: unknown): SchemaAtributos {
    const resultado = esquemaLista.safeParse(json);
    if (!resultado.success) {
      throw new ErroDominio('SCHEMA_INVALIDO', 'O schema de atributos da categoria é inválido.', {
        campos: agruparProblemas(resultado.error.issues, 'schema_atributos'),
      });
    }
    return new SchemaAtributos(resultado.data);
  }

  /**
   * Valida os `atributos` de uma ocorrência e devolve os valores normalizados: textos sem espaços
   * nas pontas e campos opcionais vazios removidos. Campos fora do schema são recusados.
   */
  validar(atributos: unknown): Atributos {
    if (atributos === undefined || atributos === null) atributos = {};
    if (typeof atributos !== 'object' || Array.isArray(atributos)) {
      throw erroAtributos({ atributos: ['envie um objeto'] });
    }

    const entrada = atributos as Record<string, unknown>;
    const problemas: Record<string, string[]> = {};
    const valores: Atributos = {};

    for (const chave of Object.keys(entrada)) {
      if (!this.campos.some((campo) => campo.chave === chave)) {
        problemas[`atributos.${chave}`] = ['campo não existe nesta categoria'];
      }
    }

    for (const campo of this.campos) {
      const bruto = entrada[campo.chave];
      const vazio =
        bruto === undefined || bruto === null || (typeof bruto === 'string' && !bruto.trim());
      if (vazio) {
        if (campo.obrigatorio)
          problemas[`atributos.${campo.chave}`] = [`${campo.rotulo} é obrigatório`];
        continue;
      }

      const valor = validarValor(campo, bruto);
      if (typeof valor === 'object') {
        problemas[`atributos.${campo.chave}`] = [valor.problema];
      } else {
        valores[campo.chave] = valor;
      }
    }

    if (Object.keys(problemas).length) throw erroAtributos(problemas);
    return valores;
  }
}

function validarValor(campo: CampoAtributo, bruto: unknown): ValorAtributo | { problema: string } {
  switch (campo.tipo) {
    case 'texto': {
      if (typeof bruto !== 'string') return { problema: `${campo.rotulo} deve ser um texto` };
      const texto = bruto.trim();
      return texto.length <= campo.max
        ? texto
        : { problema: `${campo.rotulo} aceita até ${campo.max} caracteres` };
    }
    case 'numero': {
      if (typeof bruto !== 'number' || !Number.isFinite(bruto)) {
        return { problema: `${campo.rotulo} deve ser um número` };
      }
      return bruto >= campo.min && bruto <= campo.max
        ? bruto
        : { problema: `${campo.rotulo} deve estar entre ${campo.min} e ${campo.max}` };
    }
    case 'opcao': {
      return typeof bruto === 'string' && campo.opcoes.includes(bruto)
        ? bruto
        : { problema: `${campo.rotulo} deve ser uma das opções: ${campo.opcoes.join(', ')}` };
    }
  }
}

function erroAtributos(campos: Record<string, string[]>): ErroDominio {
  return new ErroDominio('ATRIBUTOS_INVALIDOS', 'Os atributos da ocorrência são inválidos.', {
    campos,
  });
}

function agruparProblemas(
  problemas: z.core.$ZodIssue[],
  prefixo: string,
): Record<string, string[]> {
  const campos: Record<string, string[]> = {};
  for (const problema of problemas) {
    const caminho = [prefixo, ...problema.path.map(String)].join('.');
    (campos[caminho] ??= []).push(problema.message);
  }
  return campos;
}
