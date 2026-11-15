import { describe, expect, it } from 'vitest';

import type { CategoriaAdmin } from './administracao';
import {
  type CampoEditavel,
  campoNovo,
  chaveDoRotulo,
  dadosDoFormulario,
  errosDosCamposExtras,
  formularioDe,
  formularioValido,
  paraEdicao,
  paraEnvio,
  problemaDoIcone,
  problemaDoPrazo,
  problemaDoSlug,
  problemasDoCampo,
  slugDoNome,
} from './categorias-admin';

const campo = (mudancas: Partial<CampoEditavel> = {}): CampoEditavel => ({
  ...campoNovo(),
  chave: 'numero_poste',
  rotulo: 'Número do poste',
  ...mudancas,
});

const ILUMINACAO: CategoriaAdmin = {
  id: 2,
  slug: 'iluminacao',
  nome: 'Iluminação',
  icone: 'lightbulb',
  sla_dias: 15,
  ativa: true,
  schema_atributos: [
    {
      chave: 'numero_poste',
      rotulo: 'Número do poste',
      tipo: 'texto',
      obrigatorio: false,
      max: 20,
    },
    {
      chave: 'lampadas',
      rotulo: 'Lâmpadas apagadas',
      tipo: 'numero',
      obrigatorio: true,
      min: 1,
      max: 10,
    },
    {
      chave: 'periodo',
      rotulo: 'Período',
      tipo: 'opcao',
      obrigatorio: false,
      opcoes: ['Dia', 'Noite'],
    },
  ],
};

describe('conversão dos campos extras', () => {
  it('cada tipo vai para a API só com as suas propriedades', () => {
    const base = { chave: 'x_y', rotulo: ' Rótulo ', obrigatorio: true, min: 2, max: 9 };
    const opcoes = [' A ', 'B'];
    expect(paraEnvio({ ...base, tipo: 'texto', opcoes })).toEqual({
      chave: 'x_y',
      rotulo: 'Rótulo',
      tipo: 'texto',
      obrigatorio: true,
      max: 9,
    });
    expect(paraEnvio({ ...base, tipo: 'numero', opcoes })).toEqual({
      chave: 'x_y',
      rotulo: 'Rótulo',
      tipo: 'numero',
      obrigatorio: true,
      min: 2,
      max: 9,
    });
    expect(paraEnvio({ ...base, tipo: 'opcao', opcoes })).toEqual({
      chave: 'x_y',
      rotulo: 'Rótulo',
      tipo: 'opcao',
      obrigatorio: true,
      opcoes: ['A', 'B'],
    });
  });

  it('abrir e salvar uma categoria sem mexer devolve o mesmo cadastro', () => {
    const { slug, nome, icone, sla_dias, ativa, schema_atributos } = ILUMINACAO;
    expect(dadosDoFormulario(formularioDe(ILUMINACAO))).toEqual({
      slug,
      nome,
      icone,
      sla_dias,
      ativa,
      schema_atributos,
    });
    expect(ILUMINACAO.schema_atributos.map(paraEdicao).map(paraEnvio)).toEqual(
      ILUMINACAO.schema_atributos,
    );
  });

  it('a categoria nova começa ativa e sem campos extras', () => {
    expect(formularioDe(null)).toEqual({
      slug: '',
      nome: '',
      icone: '',
      slaDias: null,
      ativa: true,
      campos: [],
    });
  });
});

describe('sugestões de slug e de chave', () => {
  it.each([
    ['Água e esgoto', 'agua-e-esgoto'],
    ['  Limpeza   urbana! ', 'limpeza-urbana'],
    ['Poda de árvore 2', 'poda-de-arvore-2'],
  ])('o nome %j sugere o slug %s', (nome, slug) => {
    expect(slugDoNome(nome)).toBe(slug);
  });

  it.each([
    ['Número do poste', 'numero_do_poste'],
    ['Altura (m)', 'altura_m'],
    ['Placa 2', 'placa'],
  ])('o rótulo %j sugere a chave %s', (rotulo, chave) => {
    expect(chaveDoRotulo(rotulo)).toBe(chave);
  });

  it('a chave sugerida cabe em 30 caracteres sem cortar no meio de uma palavra', () => {
    const chave = chaveDoRotulo('Distância aproximada até a esquina mais próxima');
    expect(chave).toBe('distancia_aproximada_ate_a');
    expect(chave.length).toBeLessThanOrEqual(30);
  });
});

describe('validação do cadastro', () => {
  it.each([
    ['iluminacao', null],
    ['agua-esgoto', null],
    ['A', 'Use de 2 a 40 letras minúsculas, números ou hífens'],
    ['com espaço', 'Use de 2 a 40 letras minúsculas, números ou hífens'],
  ])('slug %j', (slug, esperado) => {
    expect(problemaDoSlug(slug)).toBe(esperado);
  });

  it('ícone é um nome do Material Icons', () => {
    expect(problemaDoIcone('water_drop')).toBeNull();
    expect(problemaDoIcone('Water Drop')).not.toBeNull();
  });

  it.each([
    [null, 'Informe o prazo em dias'],
    [1.5, 'Informe o prazo em dias'],
    [0, 'O prazo deve ser de 1 a 365 dias'],
    [366, 'O prazo deve ser de 1 a 365 dias'],
    [1, null],
    [365, null],
  ])('prazo %j', (dias, esperado) => {
    expect(problemaDoPrazo(dias)).toBe(esperado);
  });

  it('texto precisa de um tamanho máximo a partir de 1', () => {
    expect(problemasDoCampo(campo({ max: 20 }), [])).toEqual({});
    expect(problemasDoCampo(campo({ max: 0 }), [])).toHaveProperty('max');
    expect(problemasDoCampo(campo({ max: null }), [])).toHaveProperty('max');
  });

  it('número precisa de mínimo e máximo, com o mínimo até o máximo', () => {
    expect(problemasDoCampo(campo({ tipo: 'numero', min: 1, max: 10 }), [])).toEqual({});
    expect(problemasDoCampo(campo({ tipo: 'numero', min: null, max: 10 }), [])).toEqual({
      min: 'Informe o mínimo',
    });
    expect(problemasDoCampo(campo({ tipo: 'numero', min: 11, max: 10 }), [])).toEqual({
      min: 'O mínimo não pode passar do máximo',
    });
  });

  it('opções: ao menos uma, sem vazias e sem repetidas', () => {
    expect(problemasDoCampo(campo({ tipo: 'opcao', opcoes: ['Dia'] }), [])).toEqual({});
    expect(problemasDoCampo(campo({ tipo: 'opcao', opcoes: [] }), [])).toEqual({
      opcoes: 'Informe ao menos uma opção',
    });
    expect(problemasDoCampo(campo({ tipo: 'opcao', opcoes: ['Dia', ' Dia '] }), [])).toEqual({
      opcoes: 'Há opções repetidas',
    });
  });

  it('chave e rótulo seguem as regras, e duas chaves iguais não passam', () => {
    expect(problemasDoCampo(campo({ chave: 'Poste', rotulo: ' ' }), [])).toEqual({
      chave: 'Use de 2 a 30 letras minúsculas ou _',
      rotulo: 'Informe o rótulo',
    });
    const repetidos = [campo(), campo()];
    expect(problemasDoCampo(repetidos[0]!, repetidos)).toEqual({
      chave: 'Outro campo já usa esta chave',
    });
  });

  it('o formulário só é válido com o cadastro e todos os campos extras certos', () => {
    const formulario = formularioDe(ILUMINACAO);
    expect(formularioValido(formulario)).toBe(true);
    expect(formularioValido({ ...formulario, slaDias: 0 })).toBe(false);
    expect(formularioValido({ ...formulario, campos: [campo({ chave: '' })] })).toBe(false);
  });
});

describe('errosDosCamposExtras', () => {
  it('separa os erros da API por posição do campo', () => {
    expect(
      errosDosCamposExtras({
        'schema_atributos.0.chave': 'Use de 2 a 30 letras minúsculas ou _',
        'schema_atributos.2.opcoes': 'Há opções repetidas',
        slug: 'Slug em uso',
      }),
    ).toEqual({
      porCampo: {
        0: { chave: 'Use de 2 a 30 letras minúsculas ou _' },
        2: { opcoes: 'Há opções repetidas' },
      },
      geral: null,
    });
  });

  it('erro que não aponta uma propriedade do campo vira mensagem geral', () => {
    expect(
      errosDosCamposExtras({ 'schema_atributos.1': 'Invalid input', schema_atributos: 'x' }),
    ).toEqual({ porCampo: {}, geral: 'Invalid input' });
  });
});
