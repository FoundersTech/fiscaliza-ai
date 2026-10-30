import { describe, expect, it } from 'vitest';

import {
  atributosParaEnvio,
  type CampoAtributo,
  type Categoria,
  passoDescricaoCompleto,
  passoFotosCompleto,
  passoLocalCompleto,
  problemaDaDescricao,
  problemaDoAtributo,
} from './registro';

const POSTE: CampoAtributo = {
  chave: 'numero_poste',
  rotulo: 'Número do poste',
  tipo: 'texto',
  obrigatorio: true,
  max: 20,
};
const LAMPADAS: CampoAtributo = {
  chave: 'lampadas',
  rotulo: 'Lâmpadas apagadas',
  tipo: 'numero',
  obrigatorio: false,
  min: 1,
  max: 10,
};
const TURNO: CampoAtributo = {
  chave: 'turno',
  rotulo: 'Turno',
  tipo: 'opcao',
  obrigatorio: false,
  opcoes: ['Dia', 'Noite'],
};

const ILUMINACAO: Categoria = {
  id: 2,
  slug: 'iluminacao',
  nome: 'Iluminação',
  icone: 'lightbulb',
  schema_atributos: [POSTE, LAMPADAS, TURNO],
};
const DESCRICAO = 'Poste apagado na esquina';

describe('passo 1: fotos', () => {
  it.each([
    [0, false],
    [1, true],
    [2, true],
    [3, false],
  ])('%d foto(s): completo %s', (quantidade, completo) => {
    expect(passoFotosCompleto(quantidade)).toBe(completo);
  });
});

describe('passo 2: categoria, descrição e atributos', () => {
  it('a descrição vai de 10 a 500 caracteres, sem contar os espaços nas pontas', () => {
    expect(problemaDaDescricao('   curta    ')).toBe('Descreva com pelo menos 10 caracteres');
    expect(problemaDaDescricao('a'.repeat(10))).toBeNull();
    expect(problemaDaDescricao('a'.repeat(500))).toBeNull();
    expect(problemaDaDescricao('a'.repeat(501))).toBe('A descrição aceita até 500 caracteres');
  });

  it('não avança sem categoria', () => {
    expect(passoDescricaoCompleto(null, DESCRICAO, {})).toBe(false);
  });

  it('uma categoria com atributo obrigatório não avança enquanto ele está vazio', () => {
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, {})).toBe(false);
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, { numero_poste: '   ' })).toBe(false);
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, { numero_poste: 'P-123' })).toBe(true);
  });

  it('um opcional preenchido também precisa ser válido', () => {
    const base = { numero_poste: 'P-123' };
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, { ...base, lampadas: 11 })).toBe(false);
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, { ...base, turno: 'Tarde' })).toBe(false);
    expect(passoDescricaoCompleto(ILUMINACAO, DESCRICAO, { ...base, lampadas: null })).toBe(true);
  });

  it('as mensagens seguem as regras da API', () => {
    expect(problemaDoAtributo(POSTE, '')).toBe('Número do poste é obrigatório');
    expect(problemaDoAtributo(POSTE, 'x'.repeat(21))).toBe(
      'Número do poste aceita até 20 caracteres',
    );
    expect(problemaDoAtributo(LAMPADAS, 0)).toBe('Lâmpadas apagadas deve estar entre 1 e 10');
    expect(problemaDoAtributo(TURNO, 'Tarde')).toBe('Escolha uma opção de Turno');
    expect(problemaDoAtributo(TURNO, 'Noite')).toBeNull();
  });

  it('envia os textos aparados e deixa de fora os opcionais vazios', () => {
    expect(
      atributosParaEnvio(ILUMINACAO, { numero_poste: '  P-123 ', lampadas: null, turno: '' }),
    ).toEqual({ numero_poste: 'P-123' });
  });
});

describe('passo 3: localização', () => {
  const PONTO = { lat: -23.5015, lng: -47.4526 };
  const pronto = { ponto: PONTO, origem: 'GPS' as const, dentroDaArea: true, consultando: false };

  it('com o ponto do GPS dentro da área, pode enviar', () => {
    expect(passoLocalCompleto(pronto)).toBe(true);
  });

  it('sem GPS, o pino no centro do município só vale depois de movido', () => {
    expect(passoLocalCompleto({ ...pronto, origem: 'CENTRO' })).toBe(false);
    expect(passoLocalCompleto({ ...pronto, origem: 'MAPA' })).toBe(true);
  });

  it('fora da área, ou enquanto o endereço é conferido, não envia', () => {
    expect(passoLocalCompleto({ ...pronto, dentroDaArea: false })).toBe(false);
    expect(passoLocalCompleto({ ...pronto, consultando: true })).toBe(false);
  });

  it('se a consulta do endereço falhou, quem decide a área é a API, no envio', () => {
    expect(passoLocalCompleto({ ...pronto, dentroDaArea: null })).toBe(true);
  });

  it('sem ponto, não envia', () => {
    expect(passoLocalCompleto({ ...pronto, ponto: null })).toBe(false);
  });
});
