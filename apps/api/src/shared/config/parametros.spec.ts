import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ErroConfiguracao } from './erro-configuracao.js';
import { carregarParametros, validarParametros } from './parametros.js';

function parametrosValidos() {
  return {
    score: {
      janela_dias: 90,
      pesos: { resolucao: 0.5, prazo: 0.3, satisfacao: 0.2 },
      suavizacao_k: 10,
      prior: 0.5,
      faixas: [
        { min: 9, rotulo: 'Ótimo' },
        { min: 6, rotulo: 'Regular' },
        { min: 0, rotulo: 'Ruim' },
      ],
      recalculo_cron: '0 * * * *',
    },
    urgente_min_confirmacoes: 10,
    duplicidade_raio_m: 60,
    janela_pos_resolucao_dias: 10,
    moderacao_estrategia: 'APROVAR_TUDO',
  };
}

function mensagemDoErro(acao: () => unknown): string {
  try {
    acao();
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroConfiguracao);
    return (erro as Error).message;
  }
  throw new Error('era esperado um ErroConfiguracao');
}

describe('validarParametros', () => {
  it('aceita parâmetros válidos', () => {
    expect(validarParametros(parametrosValidos()).score.pesos.resolucao).toBe(0.5);
  });

  it('recusa pesos que não somam 1 e aponta score.pesos', () => {
    const parametros = parametrosValidos();
    parametros.score.pesos.satisfacao = 0.1;

    const mensagem = mensagemDoErro(() => validarParametros(parametros));

    expect(mensagem).toContain('score.pesos');
    expect(mensagem).toContain('soma atual: 0.9');
  });

  it('recusa faixas fora de ordem decrescente', () => {
    const parametros = parametrosValidos();
    parametros.score.faixas = [
      { min: 6, rotulo: 'Regular' },
      { min: 9, rotulo: 'Ótimo' },
      { min: 0, rotulo: 'Ruim' },
    ];

    expect(mensagemDoErro(() => validarParametros(parametros))).toContain('score.faixas.1.min');
  });

  it('recusa faixas que não terminam em 0', () => {
    const parametros = parametrosValidos();
    parametros.score.faixas = [{ min: 5, rotulo: 'Regular' }];

    expect(mensagemDoErro(() => validarParametros(parametros))).toContain('score.faixas');
  });

  it('recusa chaves desconhecidas (erro de digitação)', () => {
    const parametros = { ...parametrosValidos(), urgente_minimo: 3 };

    expect(mensagemDoErro(() => validarParametros(parametros))).toContain('urgente_minimo');
  });
});

describe('carregarParametros', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'parametros-'));

  it('lê e valida o arquivo', () => {
    const caminho = join(pasta, 'ok.json');
    writeFileSync(caminho, JSON.stringify(parametrosValidos()));

    expect(carregarParametros(caminho).duplicidade_raio_m).toBe(60);
  });

  it('avisa quando o arquivo não existe', () => {
    expect(mensagemDoErro(() => carregarParametros(join(pasta, 'nao-existe.json')))).toContain(
      'não encontrado',
    );
  });

  it('avisa quando o arquivo não é JSON', () => {
    const caminho = join(pasta, 'quebrado.json');
    writeFileSync(caminho, '{ score: ');

    expect(mensagemDoErro(() => carregarParametros(caminho))).toContain('não é um JSON válido');
  });

  it('o parametros.json versionado é válido', () => {
    expect(() => carregarParametros('config/parametros.json')).not.toThrow();
  });
});
