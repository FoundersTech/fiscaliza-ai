import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ErroConfiguracao, formatarProblemas } from './erro-configuracao.js';

/** Parâmetros provisórios da RN-16 (design: "Parâmetros [provisórios]"). */
export const PARAMETROS = Symbol('PARAMETROS');

const TOLERANCIA_SOMA = 1e-9;

const esquemaPesos = z
  .strictObject({
    resolucao: z.number().min(0).max(1),
    prazo: z.number().min(0).max(1),
    satisfacao: z.number().min(0).max(1),
  })
  .superRefine((pesos, contexto) => {
    const soma = pesos.resolucao + pesos.prazo + pesos.satisfacao;
    if (Math.abs(soma - 1) > TOLERANCIA_SOMA) {
      contexto.addIssue({
        code: 'custom',
        message: `os pesos precisam somar 1 (soma atual: ${Number(soma.toFixed(6))})`,
      });
    }
  });

const esquemaFaixas = z
  .array(z.strictObject({ min: z.number().min(0).max(10), rotulo: z.string().min(1) }))
  .min(1)
  .superRefine((faixas, contexto) => {
    faixas.forEach((faixa, indice) => {
      const anterior = faixas[indice - 1];
      if (anterior && faixa.min >= anterior.min) {
        contexto.addIssue({
          code: 'custom',
          path: [indice, 'min'],
          message: 'as faixas precisam vir em ordem decrescente de min',
        });
      }
    });
    if (faixas.at(-1)?.min !== 0) {
      contexto.addIssue({
        code: 'custom',
        message: 'a última faixa precisa ter min 0, para todo score ter classificação',
      });
    }
  });

const esquemaParametros = z.strictObject({
  score: z.strictObject({
    janela_dias: z.number().int().positive(),
    pesos: esquemaPesos,
    suavizacao_k: z.number().positive(),
    prior: z.number().min(0).max(1),
    faixas: esquemaFaixas,
    recalculo_cron: z.string().regex(/^\S+(\s+\S+){4}$/, 'use uma expressão cron de 5 campos'),
  }),
  urgente_min_confirmacoes: z.number().int().positive(),
  duplicidade_raio_m: z.number().positive(),
  janela_pos_resolucao_dias: z.number().int().positive(),
  moderacao_estrategia: z.enum(['APROVAR_TUDO']),
});

export type Parametros = z.output<typeof esquemaParametros>;

export function validarParametros(conteudo: unknown, origem = 'parametros.json'): Parametros {
  const resultado = esquemaParametros.safeParse(conteudo);
  if (!resultado.success) {
    throw new ErroConfiguracao(formatarProblemas(origem, resultado.error.issues));
  }
  return resultado.data;
}

/** Lê e valida o arquivo de parâmetros. O caminho é relativo à pasta de onde a API roda. */
export function carregarParametros(caminho: string): Parametros {
  const caminhoAbsoluto = resolve(process.cwd(), caminho);

  let texto: string;
  try {
    texto = readFileSync(caminhoAbsoluto, 'utf8');
  } catch {
    throw new ErroConfiguracao(`Arquivo de parâmetros não encontrado: ${caminhoAbsoluto}`);
  }

  let conteudo: unknown;
  try {
    conteudo = JSON.parse(texto);
  } catch {
    throw new ErroConfiguracao(`Arquivo de parâmetros não é um JSON válido: ${caminhoAbsoluto}`);
  }

  return validarParametros(conteudo, caminho);
}
