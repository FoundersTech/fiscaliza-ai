import { describe, expect, it } from 'vitest';

import {
  alternar,
  type Armazenamento,
  lerPreferencia,
  modoQuasar,
  salvarPreferencia,
} from './tema';

function armazenamentoFalso(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => void dados.set(chave, valor),
  };
}

const BLOQUEADO: Armazenamento = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('preferência de tema', () => {
  it('o tema escolhido continua depois de recarregar', () => {
    const armazenamento = armazenamentoFalso();

    salvarPreferencia(armazenamento, 'escuro');
    // "Recarregar" = ler de novo do mesmo armazenamento, como o boot faz.
    expect(lerPreferencia(armazenamento)).toBe('escuro');
    expect(modoQuasar(lerPreferencia(armazenamento))).toBe(true);
  });

  it('sem preferência salva, segue o aparelho', () => {
    expect(lerPreferencia(armazenamentoFalso())).toBe('sistema');
    expect(modoQuasar('sistema')).toBe('auto');
  });

  it('ignora valor desconhecido', () => {
    const armazenamento = armazenamentoFalso();
    armazenamento.dados.set('fa:tema', 'roxo');
    expect(lerPreferencia(armazenamento)).toBe('sistema');
  });

  it('com o armazenamento bloqueado, não quebra e segue o aparelho', () => {
    expect(() => salvarPreferencia(BLOQUEADO, 'claro')).not.toThrow();
    expect(lerPreferencia(BLOQUEADO)).toBe('sistema');
    expect(lerPreferencia(undefined)).toBe('sistema');
  });

  it('o botão de lua alterna a partir do que está na tela', () => {
    expect(alternar(true)).toBe('claro');
    expect(alternar(false)).toBe('escuro');
    expect(modoQuasar('claro')).toBe(false);
  });
});
