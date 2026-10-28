import { Body, Controller, Get, Post } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ErroAplicacao } from './erro-aplicacao.js';
import { FiltroErros } from './filtro-erros.js';
import { criarPipeValidacao } from './validacao.js';

class EnderecoDto {
  @IsString()
  rua!: string;
}

class CadastroDto {
  @IsString()
  nome!: string;

  @IsInt()
  @Min(1)
  idade!: number;

  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco!: EnderecoDto;
}

@Controller('teste')
class TesteController {
  @Post()
  criar(@Body() corpo: CadastroDto): CadastroDto {
    return corpo;
  }

  @Get('regra')
  regra(): never {
    throw new ErroAplicacao('JA_CONFIRMADA', 'Você já confirmou esta ocorrência.', 409);
  }

  @Get('falha')
  falha(): never {
    throw new Error('senha do banco: hunter2');
  }
}

describe('FiltroErros + validação global', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [TesteController] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    app.useGlobalPipes(criarPipeValidacao());
    app.useGlobalFilters(new FiltroErros(app.get(HttpAdapterHost)));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('aceita um corpo válido', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/teste',
      payload: { nome: 'Ana', idade: 30, endereco: { rua: 'Av. Ipanema' } },
    });

    expect(resposta.statusCode).toBe(201);
  });

  it('devolve 422 VALIDACAO com os campos inválidos, inclusive os aninhados', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/teste',
      payload: { nome: 1, idade: 0, endereco: { rua: 2 } },
    });

    expect(resposta.statusCode).toBe(422);
    const corpo = resposta.json<{
      codigo: string;
      detalhes: { campos: Record<string, string[]> };
    }>();
    expect(corpo.codigo).toBe('VALIDACAO');
    expect(Object.keys(corpo.detalhes.campos).sort()).toEqual(['endereco.rua', 'idade', 'nome']);
  });

  it('recusa campos que não estão no DTO', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/teste',
      payload: { nome: 'Ana', idade: 30, endereco: { rua: 'X' }, papel: 'ADMIN_PLATAFORMA' },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json<{ detalhes: { campos: object } }>().detalhes.campos).toHaveProperty(
      'papel',
    );
  });

  it('converte ErroAplicacao no formato da API', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/teste/regra' });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toEqual({
      codigo: 'JA_CONFIRMADA',
      mensagem: 'Você já confirmou esta ocorrência.',
      detalhes: {},
    });
  });

  it('responde 404 no formato da API para rota inexistente', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/nao-existe' });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({
      codigo: 'NAO_ENCONTRADO',
      mensagem: 'Recurso não encontrado.',
      detalhes: {},
    });
  });

  it('responde 500 sem vazar a mensagem interna', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/teste/falha' });

    expect(resposta.statusCode).toBe(500);
    expect(resposta.json<{ codigo: string }>().codigo).toBe('ERRO_INTERNO');
    expect(resposta.body).not.toContain('hunter2');
  });
});
