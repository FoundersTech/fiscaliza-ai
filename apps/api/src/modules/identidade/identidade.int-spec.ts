import { randomUUID } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { EMISSOR_TOKEN, type EmissorToken } from './application/portas.js';
import { Papel } from './domain/papel.js';
import { Autenticado } from './presentation/autenticacao.js';

/** Uma rota só de agente, para testar o guard de papel antes de existirem as rotas reais. */
@Controller('teste-agente')
class RotaDeAgente {
  @Get()
  @Autenticado(Papel.AGENTE_ORGAO)
  responder(): { ok: true } {
    return { ok: true };
  }
}

const IP = '203.0.113.10';

function cadastro(mudancas: Record<string, unknown> = {}) {
  return {
    nome: 'Maria da Silva',
    apelido_publico: 'maria.s',
    email: 'maria@exemplo.test',
    senha: 'senha-forte-1',
    politica_versao: '1',
    ...mudancas,
  };
}

describe('Cadastro, login e autorização', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RotaDeAgente],
    }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
  });

  function post(rota: string, corpo: object, ip = IP) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/${rota}`,
      payload: corpo,
      remoteAddress: ip,
    });
  }

  function get(rota: string, token?: string) {
    return app.inject({
      method: 'GET',
      url: `/${PREFIXO_API}/${rota}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  describe('POST /auth/cadastro', () => {
    it('cria um CIDADAO, devolve o token e o perfil, e guarda só o hash da senha', async () => {
      const resposta = await post('auth/cadastro', cadastro());

      expect(resposta.statusCode).toBe(201);
      const corpo = resposta.json<{ access_token: string; usuario: Record<string, unknown> }>();
      expect(corpo.usuario).toEqual({
        id: expect.any(String) as string,
        nome: 'Maria da Silva',
        apelido_publico: 'maria.s',
        email: 'maria@exemplo.test',
        papel: 'CIDADAO',
        municipio_id: null,
        orgao_id: null,
        precisa_aceitar_politica: false,
      });

      const gravado = await prisma.usuario.findFirstOrThrow();
      expect(gravado.papel).toBe('CIDADAO');
      expect(gravado.senhaHash).toMatch(/^\$argon2id\$/);
      expect(gravado.politicaAceitaEm).toBeInstanceOf(Date);

      const perfil = await get('me', corpo.access_token);
      expect(perfil.statusCode).toBe(200);
      expect(perfil.json()).toEqual(corpo.usuario);
    });

    it('recusa `papel` no corpo com 422, sem criar a conta', async () => {
      const resposta = await post('auth/cadastro', cadastro({ papel: 'ADMIN_PLATAFORMA' }));

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { papel: expect.any(Array) as unknown[] } },
      });
      expect(await prisma.usuario.count()).toBe(0);
    });

    it('recusa senha com 7 caracteres com 422', async () => {
      const resposta = await post('auth/cadastro', cadastro({ senha: '1234567' }));

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        detalhes: { campos: { senha: ['a senha deve ter de 8 a 128 caracteres'] } },
      });
    });

    it('recusa o mesmo e-mail com outras maiúsculas com 409', async () => {
      await post('auth/cadastro', cadastro());
      const resposta = await post('auth/cadastro', cadastro({ email: 'MARIA@Exemplo.TEST' }));

      expect(resposta.statusCode).toBe(409);
      expect(resposta.json()).toMatchObject({ codigo: 'EMAIL_EM_USO' });
      expect(await prisma.usuario.count()).toBe(1);
    });

    it('recusa versão da política diferente da vigente com 422', async () => {
      const resposta = await post('auth/cadastro', cadastro({ politica_versao: '0' }));

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'POLITICA_DESATUALIZADA',
        detalhes: { versao_vigente: '1' },
      });
    });

    it('o 6º cadastro do mesmo IP em 1 hora recebe 429', async () => {
      for (let i = 1; i <= 5; i++) {
        const resposta = await post(
          'auth/cadastro',
          cadastro({ email: `pessoa${i}@exemplo.test` }),
        );
        expect(resposta.statusCode).toBe(201);
      }
      const sexto = await post('auth/cadastro', cadastro({ email: 'pessoa6@exemplo.test' }));

      expect(sexto.statusCode).toBe(429);
      expect(sexto.headers['retry-after']).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await post('auth/cadastro', cadastro(), '198.51.100.1');
    });

    it('entra com e-mail em qualquer caixa e devolve o mesmo perfil', async () => {
      const resposta = await post('auth/login', {
        email: ' MARIA@exemplo.test ',
        senha: 'senha-forte-1',
      });

      expect(resposta.statusCode).toBe(200);
      const corpo = resposta.json<{ access_token: string; usuario: { email: string } }>();
      expect(corpo.usuario.email).toBe('maria@exemplo.test');
      expect((await get('me', corpo.access_token)).statusCode).toBe(200);
    });

    it('e-mail inexistente e senha errada devolvem o mesmo 401', async () => {
      const semConta = await post('auth/login', {
        email: 'ninguem@exemplo.test',
        senha: 'senha-forte-1',
      });
      const senhaErrada = await post('auth/login', {
        email: 'maria@exemplo.test',
        senha: 'outra-senha',
      });

      expect(semConta.statusCode).toBe(401);
      expect(senhaErrada.statusCode).toBe(401);
      expect(semConta.json()).toEqual(senhaErrada.json());
      expect(semConta.json()).toEqual({
        codigo: 'CREDENCIAIS_INVALIDAS',
        mensagem: 'E-mail ou senha inválidos.',
        detalhes: {},
      });
    });

    it('conta desativada recebe o mesmo 401, e o token antigo deixa de abrir o /me', async () => {
      const { access_token } = (
        await post('auth/login', { email: 'maria@exemplo.test', senha: 'senha-forte-1' })
      ).json<{ access_token: string }>();
      await prisma.usuario.updateMany({ data: { ativo: false } });

      const resposta = await post('auth/login', {
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
      });
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
      expect((await get('me', access_token)).statusCode).toBe(401);
    });

    it('o 6º login errado em 1 minuto recebe 429; outro IP continua podendo tentar', async () => {
      for (let i = 1; i <= 5; i++) {
        const resposta = await post('auth/login', {
          email: 'maria@exemplo.test',
          senha: `errada-${i}`,
        });
        expect(resposta.statusCode).toBe(401);
      }
      const sexto = await post('auth/login', {
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
      });

      expect(sexto.statusCode).toBe(429);
      expect(sexto.json()).toMatchObject({ codigo: 'MUITAS_REQUISICOES' });
      expect(Number(sexto.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(sexto.headers['retry-after'])).toBeLessThanOrEqual(60);

      const outroIp = await post(
        'auth/login',
        { email: 'maria@exemplo.test', senha: 'senha-forte-1' },
        '192.0.2.50',
      );
      expect(outroIp.statusCode).toBe(200);
    });
  });

  describe('Autorização', () => {
    function token(papel: Papel): Promise<string> {
      return app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
        usuarioId: randomUUID(),
        papel,
        municipioId: 3552205,
        orgaoId: papel === Papel.AGENTE_ORGAO ? 1 : null,
      });
    }

    it('um token de cidadão numa rota de agente recebe 403', async () => {
      const resposta = await get('teste-agente', await token(Papel.CIDADAO));

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
    });

    it('um token de agente passa', async () => {
      const resposta = await get('teste-agente', await token(Papel.AGENTE_ORGAO));
      expect(resposta.statusCode).toBe(200);
    });

    it.each([
      ['sem token', undefined],
      ['com token inválido', 'abc.def.ghi'],
    ])('%s recebe 401', async (_caso, valor) => {
      const resposta = await get('teste-agente', valor);

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'NAO_AUTENTICADO' });
    });
  });
});
