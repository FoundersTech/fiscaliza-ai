import { describe, expect, it } from 'vitest';

import { SchemaAtributos } from './schema-atributos.js';

const SCHEMA = SchemaAtributos.criar([
  { chave: 'numero_poste', rotulo: 'Número do poste', tipo: 'texto', obrigatorio: true, max: 20 },
  { chave: 'altura_m', rotulo: 'Altura', tipo: 'numero', obrigatorio: false, min: 0, max: 30 },
  {
    chave: 'gravidade',
    rotulo: 'Gravidade',
    tipo: 'opcao',
    obrigatorio: false,
    opcoes: ['baixa', 'media', 'alta'],
  },
]);

function campos(acao: () => unknown): unknown {
  try {
    acao();
  } catch (erro) {
    return (erro as { codigo: string; detalhes: { campos: unknown } }).detalhes.campos;
  }
  throw new Error('era esperado um erro');
}

describe('SchemaAtributos.validar', () => {
  it('aceita valores válidos e normaliza textos e opcionais vazios', () => {
    expect(SCHEMA.validar({ numero_poste: '  P-123 ', altura_m: 7.5, gravidade: '' })).toEqual({
      numero_poste: 'P-123',
      altura_m: 7.5,
    });
  });

  it.each([undefined, null, '', '   '])('rejeita obrigatório vazio (%j)', (valor) => {
    expect(() => SCHEMA.validar({ numero_poste: valor })).toThrow(
      expect.objectContaining({ codigo: 'ATRIBUTOS_INVALIDOS' }) as Error,
    );
    expect(campos(() => SCHEMA.validar({ numero_poste: valor }))).toEqual({
      'atributos.numero_poste': ['Número do poste é obrigatório'],
    });
  });

  it('aponta cada campo com problema', () => {
    expect(
      campos(() =>
        SCHEMA.validar({
          numero_poste: 'x'.repeat(21),
          altura_m: 31,
          gravidade: 'urgente',
          cor: 'azul',
        }),
      ),
    ).toEqual({
      'atributos.numero_poste': ['Número do poste aceita até 20 caracteres'],
      'atributos.altura_m': ['Altura deve estar entre 0 e 30'],
      'atributos.gravidade': ['Gravidade deve ser uma das opções: baixa, media, alta'],
      'atributos.cor': ['campo não existe nesta categoria'],
    });
  });

  it.each([
    [{ numero_poste: 123 }, 'atributos.numero_poste'],
    [{ numero_poste: 'P1', altura_m: '7' }, 'atributos.altura_m'],
    [{ numero_poste: 'P1', altura_m: Number.NaN }, 'atributos.altura_m'],
  ])('rejeita tipo errado em %j', (atributos, campo) => {
    expect(campos(() => SCHEMA.validar(atributos))).toHaveProperty([campo]);
  });

  it('com schema vazio, aceita {} ou ausente e recusa qualquer campo', () => {
    const vazio = SchemaAtributos.criar([]);
    expect(vazio.validar({})).toEqual({});
    expect(vazio.validar(undefined)).toEqual({});
    expect(campos(() => vazio.validar({ extra: 1 }))).toEqual({
      'atributos.extra': ['campo não existe nesta categoria'],
    });
  });

  it.each([[[]], ['texto'], [42]])('recusa atributos que não são objeto (%j)', (atributos) => {
    expect(campos(() => SCHEMA.validar(atributos))).toEqual({ atributos: ['envie um objeto'] });
  });
});

describe('SchemaAtributos.criar', () => {
  it.each([
    [
      'chave fora do padrão',
      [{ chave: 'Poste', rotulo: 'P', tipo: 'texto', obrigatorio: false, max: 5 }],
    ],
    ['tipo desconhecido', [{ chave: 'poste', rotulo: 'P', tipo: 'data', obrigatorio: false }]],
    ['texto sem max', [{ chave: 'poste', rotulo: 'P', tipo: 'texto', obrigatorio: false }]],
    [
      'min maior que max',
      [{ chave: 'nivel', rotulo: 'N', tipo: 'numero', obrigatorio: false, min: 5, max: 1 }],
    ],
    [
      'opção sem opções',
      [{ chave: 'op', rotulo: 'O', tipo: 'opcao', obrigatorio: false, opcoes: [] }],
    ],
    [
      'chave repetida',
      [
        { chave: 'poste', rotulo: 'P', tipo: 'texto', obrigatorio: false, max: 5 },
        { chave: 'poste', rotulo: 'P2', tipo: 'texto', obrigatorio: false, max: 5 },
      ],
    ],
    [
      'propriedade extra',
      [{ chave: 'poste', rotulo: 'P', tipo: 'texto', obrigatorio: false, max: 5, x: 1 }],
    ],
    ['não é lista', { chave: 'poste' }],
  ])('recusa schema com %s', (_caso, json) => {
    expect(() => SchemaAtributos.criar(json)).toThrow(
      expect.objectContaining({ codigo: 'SCHEMA_INVALIDO' }) as Error,
    );
  });

  it('indica o caminho do problema', () => {
    expect(
      campos(() =>
        SchemaAtributos.criar([
          { chave: 'nivel', rotulo: 'N', tipo: 'numero', obrigatorio: false, min: 5, max: 1 },
        ]),
      ),
    ).toEqual({ 'schema_atributos.0.min': ['min maior que max'] });
  });
});
