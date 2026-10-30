import { randomUUID } from 'node:crypto';

import { Controller, Get } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, validarAmbiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { ServicoEmail } from '../notificacoes/application/servico-email.js';
import { CriarAdminPlataforma } from './application/criar-admin.js';
import { EMISSOR_TOKEN, type EmissorToken } from './application/portas.js';
import { Papel } from './domain/papel.js';
import { Autenticado } from './presentation/autenticacao.js';

/** Rotas para testar o guard antes de existirem as rotas reais. */
@Controller()
class RotasDeTeste {
  @Get('teste-agente')
  @Autenticado(Papel.AGENTE_ORGAO)
  deAgente(): { ok: true } {
    return { ok: true };
  }

  @Get('teste-logado')
  @Autenticado()
  deQualquerLogado(): { ok: true } {
    return { ok: true };
  }
}

/** Os e-mails não saem: os testes leem daqui o token do link. */
const emails = {
  enviarRedefinicaoSenha: vi.fn<ServicoEmail['enviarRedefinicaoSenha']>(),
  enviarConvite: vi.fn<ServicoEmail['enviarConvite']>(),
};

async function criarApp(variaveis: Record<string, string> = {}): Promise<NestFastifyApplication> {
  const modulo = await Test.createTestingModule({
    imports: [AppModule],
    controllers: [RotasDeTeste],
  })
    .overrideProvider(ServicoEmail)
    .useValue(emails)
    .overrideProvider(AMBIENTE)
    .useValue(validarAmbiente({ ...process.env, ...variaveis }))
    .compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configurarApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

interface CookieResposta {
  name: string;
  value: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  expires?: Date;
}

function cookieRefresh(resposta: { cookies: CookieResposta[] }): CookieResposta {
  const cookie = resposta.cookies.find((item) => item.name === 'fa_refresh');
  if (!cookie) throw new Error('a resposta não gravou o cookie fa_refresh');
  return cookie;
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
    app = await criarApp();
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
    vi.clearAllMocks();
  });

  function post(rota: string, corpo: object, ip = IP) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/${rota}`,
      payload: corpo,
      remoteAddress: ip,
    });
  }

  function get(rota: string, token?: string, alvo = app) {
    return alvo.inject({
      method: 'GET',
      url: `/${PREFIXO_API}/${rota}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  function postLogado(rota: string, corpo: object, token: string, alvo = app) {
    return alvo.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/${rota}`,
      payload: corpo,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  function renovar(refresh?: string, comCsrf = true, alvo = app) {
    return alvo.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/refresh`,
      headers: comCsrf ? { 'x-fa-csrf': '1' } : {},
      cookies: refresh ? { fa_refresh: refresh } : {},
    });
  }

  async function entrar(): Promise<string> {
    return cookieRefresh(await post('auth/cadastro', cadastro())).value;
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
    let orgaoId: number;

    beforeAll(async () => {
      ({ orgaoId } = await aplicarCargaInicial(prisma));
    });

    /** O guard confere a conta no banco, então o token precisa ser de alguém que existe. */
    async function token(papel: Papel): Promise<string> {
      const usuario = await prisma.usuario.create({
        data: {
          nome: 'Pessoa de Teste',
          apelidoPublico: 'pessoa',
          email: `${randomUUID()}@exemplo.test`,
          senhaHash: 'sem-uso',
          papel,
          municipioId: SOROCABA.id,
          orgaoId: papel === Papel.AGENTE_ORGAO ? orgaoId : null,
          politicaVersao: '1',
        },
      });
      return app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
        usuarioId: usuario.id,
        papel,
        municipioId: usuario.municipioId,
        orgaoId: usuario.orgaoId,
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

    it('um token ainda válido de conta desativada recebe 401', async () => {
      const valido = await token(Papel.AGENTE_ORGAO);
      await prisma.usuario.updateMany({ data: { ativo: false } });

      const resposta = await get('teste-agente', valido);
      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'NAO_AUTENTICADO' });
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

  describe('Sessão com refresh rotativo', () => {
    it('cadastro e login gravam o cookie HttpOnly, Secure e SameSite=Strict, só para /api/v1/auth, por 30 dias', async () => {
      await post('auth/cadastro', cadastro());
      const login = await post('auth/login', {
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
      });

      const cookie = cookieRefresh(login);
      expect(cookie).toMatchObject({
        path: '/api/v1/auth',
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
      });
      const dias = (cookie.expires!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(dias).toBeGreaterThan(29.9);
      expect(dias).toBeLessThanOrEqual(30);

      const gravado = await prisma.refreshToken.findFirstOrThrow({ orderBy: { criadoEm: 'desc' } });
      expect(gravado.tokenHash).not.toBe(cookie.value);
      expect(gravado.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('o refresh devolve um access token novo e troca o cookie', async () => {
      const primeiro = await entrar();

      const resposta = await renovar(primeiro);

      expect(resposta.statusCode).toBe(200);
      const corpo = resposta.json<{ access_token: string; usuario: { papel: string } }>();
      expect(corpo.usuario.papel).toBe('CIDADAO');
      expect((await get('me', corpo.access_token)).statusCode).toBe(200);
      expect(cookieRefresh(resposta).value).not.toBe(primeiro);
    });

    it('reapresentar o token antigo depois de 10 s revoga a família, e o refresh seguinte devolve 401', async () => {
      const antigo = await entrar();
      const novo = cookieRefresh(await renovar(antigo)).value;
      // O antigo foi usado há 11 s.
      await prisma.refreshToken.updateMany({
        where: { usadoEm: { not: null } },
        data: { usadoEm: new Date(Date.now() - 11_000) },
      });

      const reuso = await renovar(antigo);
      expect(reuso.statusCode).toBe(401);
      expect(reuso.json()).toMatchObject({ codigo: 'SESSAO_INVALIDA' });

      const seguinte = await renovar(novo);
      expect(seguinte.statusCode).toBe(401);
      expect(await prisma.refreshToken.count({ where: { revogadoEm: null } })).toBe(0);
    });

    it('dentro de 10 s, o token antigo ainda renova (duas abas) sem derrubar a sessão', async () => {
      const antigo = await entrar();
      const novo = cookieRefresh(await renovar(antigo)).value;

      expect((await renovar(antigo)).statusCode).toBe(200);
      expect((await renovar(novo)).statusCode).toBe(200);
    });

    it('depois do logout, o refresh devolve 401 e o cookie é apagado', async () => {
      const refresh = await entrar();

      const logout = await app.inject({
        method: 'POST',
        url: `/${PREFIXO_API}/auth/logout`,
        cookies: { fa_refresh: refresh },
      });
      expect(logout.statusCode).toBe(204);
      const apagado = cookieRefresh(logout);
      expect(apagado.value).toBe('');
      expect(apagado.expires!.getTime()).toBeLessThan(Date.now());

      expect((await renovar(refresh)).statusCode).toBe(401);
    });

    it('sem X-FA-CSRF, o refresh é recusado e o token continua valendo', async () => {
      const refresh = await entrar();

      const semCsrf = await renovar(refresh, false);
      expect(semCsrf.statusCode).toBe(403);
      expect(semCsrf.json()).toMatchObject({ codigo: 'CSRF_AUSENTE' });

      expect((await renovar(refresh)).statusCode).toBe(200);
    });

    it.each([
      ['sem cookie', undefined],
      ['com um token que não existe', 'token-inventado'],
    ])('%s, o refresh devolve 401', async (_caso, refresh) => {
      const resposta = await renovar(refresh);

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'SESSAO_INVALIDA' });
    });

    it('refresh expirado devolve 401', async () => {
      const refresh = await entrar();
      await prisma.refreshToken.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });

      expect((await renovar(refresh)).statusCode).toBe(401);
    });

    it('conta desativada não renova, e a sessão é revogada', async () => {
      const refresh = await entrar();
      await prisma.usuario.updateMany({ data: { ativo: false } });

      expect((await renovar(refresh)).statusCode).toBe(401);
      expect(await prisma.refreshToken.count({ where: { revogadoEm: null } })).toBe(0);
    });
  });

  describe('Recuperação de acesso', () => {
    const EMAIL = 'maria@exemplo.test';

    async function pedirLink(): Promise<string> {
      expect((await post('auth/esqueci-senha', { email: EMAIL })).statusCode).toBe(202);
      const [dados] = emails.enviarRedefinicaoSenha.mock.lastCall ?? [];
      if (!dados) throw new Error('o e-mail de redefinição não foi enviado');
      return dados.token;
    }

    function definirSenha(token: string, senha = 'senha-nova-22') {
      return post('auth/definir-senha', { token, senha });
    }

    function login(senha: string) {
      return post('auth/login', { email: EMAIL, senha });
    }

    it('esqueci-senha responde 202 para e-mail existente e inexistente, e só a conta existente recebe o link', async () => {
      await entrar();

      const existente = await post('auth/esqueci-senha', { email: ' MARIA@exemplo.test ' });
      const inexistente = await post('auth/esqueci-senha', { email: 'ninguem@exemplo.test' });

      expect(existente.statusCode).toBe(202);
      expect(inexistente.statusCode).toBe(202);
      expect(existente.body).toBe(inexistente.body);
      expect(emails.enviarRedefinicaoSenha).toHaveBeenCalledOnce();
      expect(emails.enviarRedefinicaoSenha).toHaveBeenCalledWith({
        para: EMAIL,
        nome: 'Maria da Silva',
        token: expect.any(String) as string,
      });

      const [{ token }] = emails.enviarRedefinicaoSenha.mock.lastCall!;
      const gravado = await prisma.tokenAcesso.findFirstOrThrow();
      expect(gravado.tipo).toBe('REDEFINIR_SENHA');
      expect(gravado.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(gravado.tokenHash).not.toBe(token);
      const minutos = (gravado.expiraEm.getTime() - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(59.9);
      expect(minutos).toBeLessThanOrEqual(60);
    });

    it('depois de definir-senha, a senha nova entra, a antiga não, e o refresh antigo devolve 401', async () => {
      const doCadastro = await entrar();
      const deOutroAparelho = cookieRefresh(await login('senha-forte-1')).value;
      const token = await pedirLink();

      expect((await definirSenha(token)).statusCode).toBe(204);

      expect((await renovar(doCadastro)).statusCode).toBe(401);
      expect((await renovar(deOutroAparelho)).statusCode).toBe(401);
      expect((await login('senha-forte-1')).statusCode).toBe(401);
      expect((await login('senha-nova-22')).statusCode).toBe(200);
    });

    it('um token usado duas vezes devolve 400, e a senha fica a do primeiro uso', async () => {
      await entrar();
      const token = await pedirLink();
      expect((await definirSenha(token)).statusCode).toBe(204);

      const segunda = await definirSenha(token, 'outra-senha-33');

      expect(segunda.statusCode).toBe(400);
      expect(segunda.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
      expect((await login('senha-nova-22')).statusCode).toBe(200);
    });

    it('definir a senha invalida os outros links pendentes', async () => {
      await entrar();
      const primeiro = await pedirLink();
      const segundo = await pedirLink();

      expect((await definirSenha(segundo)).statusCode).toBe(204);
      expect((await definirSenha(primeiro, 'outra-senha-33')).statusCode).toBe(400);
    });

    it('um link com mais de 1 hora devolve 400', async () => {
      await entrar();
      const token = await pedirLink();
      await prisma.tokenAcesso.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });

      const resposta = await definirSenha(token);

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    });

    it('um token que não existe devolve 400', async () => {
      const resposta = await definirSenha('token-inventado');

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json()).toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    });

    it('recusa senha nova com 7 caracteres com 422', async () => {
      const resposta = await definirSenha('qualquer', '1234567');

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        detalhes: { campos: { senha: ['a senha deve ter de 8 a 128 caracteres'] } },
      });
    });

    it('conta desativada não recebe o link', async () => {
      await entrar();
      await prisma.usuario.updateMany({ data: { ativo: false } });

      expect((await post('auth/esqueci-senha', { email: EMAIL })).statusCode).toBe(202);
      expect(emails.enviarRedefinicaoSenha).not.toHaveBeenCalled();
    });

    it('o 4º pedido do mesmo e-mail em 1 hora recebe 429, exista ou não a conta', async () => {
      await entrar();

      for (const email of [EMAIL, 'ninguem@exemplo.test']) {
        for (const variante of [email, email.toUpperCase(), email]) {
          expect((await post('auth/esqueci-senha', { email: variante })).statusCode).toBe(202);
        }
        const quarto = await post('auth/esqueci-senha', { email }, '192.0.2.50');
        expect(quarto.statusCode).toBe(429);
        expect(quarto.json()).toMatchObject({ codigo: 'MUITAS_REQUISICOES' });
      }
      expect(emails.enviarRedefinicaoSenha).toHaveBeenCalledTimes(3);
    });
  });

  describe('Política de privacidade', () => {
    let appPoliticaNova: NestFastifyApplication;

    beforeAll(async () => {
      appPoliticaNova = await criarApp({ POLITICA_VERSAO: '2' });
    });

    afterAll(async () => {
      await appPoliticaNova.close();
    });

    async function cadastrarNaVersao1(): Promise<{ accessToken: string; refresh: string }> {
      const resposta = await post('auth/cadastro', cadastro());
      return {
        accessToken: resposta.json<{ access_token: string }>().access_token,
        refresh: cookieRefresh(resposta).value,
      };
    }

    it('com POLITICA_VERSAO nova, as rotas autenticadas devolvem 403 até o POST /me/politica', async () => {
      const { accessToken } = await cadastrarNaVersao1();

      const bloqueada = await get('teste-logado', accessToken, appPoliticaNova);
      expect(bloqueada.statusCode).toBe(403);
      expect(bloqueada.json()).toMatchObject({
        codigo: 'POLITICA_PENDENTE',
        detalhes: { versao_vigente: '2' },
      });

      const perfil = await get('me', accessToken, appPoliticaNova);
      expect(perfil.statusCode).toBe(200);
      expect(perfil.json()).toMatchObject({ precisa_aceitar_politica: true });

      const antiga = await postLogado('me/politica', { versao: '1' }, accessToken, appPoliticaNova);
      expect(antiga.statusCode).toBe(422);
      expect(antiga.json()).toMatchObject({ codigo: 'POLITICA_DESATUALIZADA' });

      const aceite = await postLogado('me/politica', { versao: '2' }, accessToken, appPoliticaNova);
      expect(aceite.statusCode).toBe(204);

      expect((await get('teste-logado', accessToken, appPoliticaNova)).statusCode).toBe(200);
      expect((await get('me', accessToken, appPoliticaNova)).json()).toMatchObject({
        precisa_aceitar_politica: false,
      });
      const gravado = await prisma.usuario.findFirstOrThrow();
      expect(gravado.politicaVersao).toBe('2');
      expect(gravado.politicaAceitaEm!.getTime()).toBeGreaterThan(gravado.criadoEm.getTime());
    });

    it('com o aceite pendente, o refresh e o logout continuam funcionando', async () => {
      const { refresh } = await cadastrarNaVersao1();

      const renovada = await renovar(refresh, true, appPoliticaNova);
      expect(renovada.statusCode).toBe(200);
      expect(renovada.json()).toMatchObject({ usuario: { precisa_aceitar_politica: true } });

      const logout = await appPoliticaNova.inject({
        method: 'POST',
        url: `/${PREFIXO_API}/auth/logout`,
        cookies: { fa_refresh: cookieRefresh(renovada).value },
      });
      expect(logout.statusCode).toBe(204);
    });

    it('aceitar de novo a versão vigente mantém a data do primeiro aceite', async () => {
      const { accessToken } = await cadastrarNaVersao1();
      const antes = await prisma.usuario.findFirstOrThrow();

      expect((await postLogado('me/politica', { versao: '1' }, accessToken)).statusCode).toBe(204);

      const depois = await prisma.usuario.findFirstOrThrow();
      expect(depois.politicaAceitaEm).toEqual(antes.politicaAceitaEm);
    });
  });

  describe('Administrador inicial', () => {
    const EMAIL_ADMIN = 'admin@exemplo.test';

    function criarAdmin(email = EMAIL_ADMIN) {
      return app.get(CriarAdminPlataforma).executar({ email });
    }

    it('criar-admin envia o convite, e o admin consegue entrar depois de definir a senha', async () => {
      await criarAdmin();

      const admin = await prisma.usuario.findFirstOrThrow();
      expect(admin).toMatchObject({
        papel: 'ADMIN_PLATAFORMA',
        senhaHash: null,
        email: EMAIL_ADMIN,
      });
      expect(emails.enviarConvite).toHaveBeenCalledWith({
        para: EMAIL_ADMIN,
        nome: 'Administração da plataforma',
        token: expect.any(String) as string,
        papel: 'ADMIN_PLATAFORMA',
      });
      const convite = await prisma.tokenAcesso.findFirstOrThrow();
      expect(convite.tipo).toBe('CONVITE');
      const horas = (convite.expiraEm.getTime() - Date.now()) / 3_600_000;
      expect(horas).toBeGreaterThan(71.9);
      expect(horas).toBeLessThanOrEqual(72);

      const credenciais = { email: EMAIL_ADMIN, senha: 'senha-do-admin-1' };
      expect((await post('auth/login', credenciais)).statusCode).toBe(401);

      const [{ token }] = emails.enviarConvite.mock.lastCall!;
      const definida = await post('auth/definir-senha', { token, senha: credenciais.senha });
      expect(definida.statusCode).toBe(204);

      const login = await post('auth/login', credenciais);
      expect(login.statusCode).toBe(200);
      expect(login.json()).toMatchObject({
        usuario: { papel: 'ADMIN_PLATAFORMA', precisa_aceitar_politica: true },
      });
    });

    it('criar-admin recusa um e-mail que já tem conta', async () => {
      await entrar();

      await expect(criarAdmin('MARIA@exemplo.test')).rejects.toMatchObject({
        codigo: 'EMAIL_EM_USO',
      });
      expect(emails.enviarConvite).not.toHaveBeenCalled();
    });
  });
});
