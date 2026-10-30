import { describe, expect, it } from 'vitest';

import { errosDosCampos, lerErroApi, mensagemDoErro } from './erros';

describe('lerErroApi', () => {
  it('lê o corpo de erro da API', () => {
    expect(
      lerErroApi({ codigo: 'EMAIL_EM_USO', mensagem: 'Já existe uma conta.', detalhes: {} }),
    ).toEqual({ codigo: 'EMAIL_EM_USO', mensagem: 'Já existe uma conta.', detalhes: {} });
  });

  it.each([undefined, null, 'texto', { message: 'Bad Gateway' }])(
    '%j não é erro da API',
    (corpo) => {
      expect(lerErroApi(corpo)).toBeNull();
    },
  );
});

describe('mensagemDoErro', () => {
  const muitas = (segundos: number) =>
    lerErroApi({
      codigo: 'MUITAS_REQUISICOES',
      mensagem: `Tente de novo em ${segundos} segundos.`,
      detalhes: { tentar_em_segundos: segundos },
    });

  it.each([
    [42, 'Muitas tentativas. Tente de novo em 42 segundos.'],
    [61, 'Muitas tentativas. Tente de novo em 2 minutos.'],
    [3540, 'Muitas tentativas. Tente de novo em 59 minutos.'],
  ])('o 429 com espera de %i s vira "%s"', (segundos, esperada) => {
    expect(mensagemDoErro(muitas(segundos), 'padrão')).toBe(esperada);
  });

  it('usa a mensagem da API, ou o padrão quando não há erro da API', () => {
    const credenciais = lerErroApi({
      codigo: 'CREDENCIAIS_INVALIDAS',
      mensagem: 'E-mail ou senha inválidos.',
    });
    expect(mensagemDoErro(credenciais, 'padrão')).toBe('E-mail ou senha inválidos.');
    expect(mensagemDoErro(null, 'padrão')).toBe('padrão');
  });
});

describe('errosDosCampos', () => {
  it('pega a primeira mensagem de cada campo de um 422 VALIDACAO, com maiúscula', () => {
    const erro = lerErroApi({
      codigo: 'VALIDACAO',
      mensagem: 'Dados inválidos.',
      detalhes: {
        campos: {
          email: ['informe um e-mail válido'],
          senha: ['a senha deve ter de 8 a 128 caracteres', 'outra'],
        },
      },
    });

    expect(errosDosCampos(erro)).toEqual({
      email: 'Informe um e-mail válido',
      senha: 'A senha deve ter de 8 a 128 caracteres',
    });
  });

  it('outros erros não têm campos', () => {
    expect(errosDosCampos(lerErroApi({ codigo: 'EMAIL_EM_USO', mensagem: 'x' }))).toEqual({});
    expect(errosDosCampos(null)).toEqual({});
  });
});
