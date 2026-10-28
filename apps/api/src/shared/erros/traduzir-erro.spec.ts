import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ErroAplicacao } from './erro-aplicacao.js';
import { traduzirErro } from './traduzir-erro.js';

describe('traduzirErro', () => {
  it('usa código, mensagem, status e detalhes de um ErroAplicacao', () => {
    const erro = new ErroAplicacao('TRANSICAO_INVALIDA', 'Transição inválida.', 422, {
      de: 'RECEBIDA',
    });

    expect(traduzirErro(erro)).toEqual({
      status: 422,
      corpo: {
        codigo: 'TRANSICAO_INVALIDA',
        mensagem: 'Transição inválida.',
        detalhes: { de: 'RECEBIDA' },
      },
    });
  });

  it('mantém o corpo de uma HttpException que já está no formato da API', () => {
    const erro = new UnprocessableEntityException({
      codigo: 'VALIDACAO',
      mensagem: 'Dados inválidos.',
      detalhes: { campos: { nome: ['obrigatório'] } },
    });

    expect(traduzirErro(erro).corpo.detalhes).toEqual({ campos: { nome: ['obrigatório'] } });
  });

  it('troca a mensagem padrão do Nest (em inglês) pela mensagem da API', () => {
    expect(traduzirErro(new NotFoundException('Cannot GET /x'))).toEqual({
      status: 404,
      corpo: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso não encontrado.', detalhes: {} },
    });
    expect(traduzirErro(new ForbiddenException()).corpo.codigo).toBe('ACESSO_NEGADO');
  });

  it('traduz erros do Fastify que trazem statusCode 4xx', () => {
    const erroFastify = Object.assign(new Error('Unsupported Media Type'), { statusCode: 415 });

    expect(traduzirErro(erroFastify)).toEqual({
      status: 415,
      corpo: {
        codigo: 'TIPO_NAO_SUPORTADO',
        mensagem: 'Tipo de conteúdo não suportado.',
        detalhes: {},
      },
    });
  });

  it('esconde a mensagem de erros inesperados', () => {
    const resultado = traduzirErro(new Error('connection refused at 10.0.0.5:5432'));

    expect(resultado.status).toBe(500);
    expect(resultado.corpo.codigo).toBe('ERRO_INTERNO');
    expect(JSON.stringify(resultado)).not.toContain('10.0.0.5');
  });
});
