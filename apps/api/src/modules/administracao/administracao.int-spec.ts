import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../identidade/application/portas.js';
import { Papel } from '../identidade/domain/papel.js';
import { ServicoEmail } from '../notificacoes/application/servico-email.js';

/** Os e-mails não saem: os testes leem daqui o token do link. */
const emails = {
  enviarRedefinicaoSenha: vi.fn<ServicoEmail['enviarRedefinicaoSenha']>(),
  enviarConvite: vi.fn<ServicoEmail['enviarConvite']>(),
};

/** Outro município, longe de Sorocaba, com o seu próprio órgão. */
const OUTRO = { id: 3523909, nome: 'Itu', uf: 'SP', sigla: 'ITU' } as const;

const SENHA = 'senha-do-agente-1';

interface Agente {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  convite_pendente: boolean;
}

describe('Administração do município e gestores', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let orgaoSorocaba: number;
  let orgaoOutro: number;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ServicoEmail)
      .useValue(emails)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);

    ({ orgaoId: orgaoSorocaba } = await aplicarCargaInicial(prisma));
    await prisma.$executeRaw`
      INSERT INTO municipio (id, nome, uf, sigla, ativo, area)
      VALUES (${OUTRO.id}, ${OUTRO.nome}, ${OUTRO.uf}, ${OUTRO.sigla}, true,
              ST_Multi(ST_MakeEnvelope(-10, 10, -9, 11, 4326)))
      ON CONFLICT (id) DO NOTHING`;
    ({ id: orgaoOutro } = await prisma.orgao.upsert({
      where: { municipioId: OUTRO.id },
      create: { municipioId: OUTRO.id, nome: 'Prefeitura de Itu', sigla: 'PMI' },
      update: {},
    }));
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await prisma.orgao.deleteMany({ where: { municipioId: OUTRO.id } });
    await prisma.municipio.deleteMany({ where: { id: OUTRO.id } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await prisma.orgao.update({
      where: { id: orgaoSorocaba },
      data: { nome: 'Prefeitura de Sorocaba', sigla: 'PMS' },
    });
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    vi.clearAllMocks();
  });

  /** Conta já com a política aceita; o guard confere no banco, então ela precisa existir. */
  async function token(papel: Papel, municipioId: number | null = SOROCABA.id): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId,
        orgaoId:
          papel === Papel.AGENTE_ORGAO
            ? municipioId === OUTRO.id
              ? orgaoOutro
              : orgaoSorocaba
            : null,
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

  function requisitar(
    method: 'GET' | 'POST' | 'PATCH',
    rota: string,
    autorizacao?: string,
    corpo?: object,
  ) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      headers: autorizacao ? { authorization: `Bearer ${autorizacao}` } : {},
      ...(corpo ? { payload: corpo } : {}),
    });
  }

  function login(email: string, senha = SENHA) {
    return requisitar('POST', 'auth/login', undefined, { email, senha });
  }

  function renovar(refresh: string) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/refresh`,
      headers: { 'x-fa-csrf': '1' },
      cookies: { fa_refresh: refresh },
    });
  }

  function ultimoConvite(): { token: string; papel: string; orgao?: string } {
    const chamada = emails.enviarConvite.mock.lastCall;
    if (!chamada) throw new Error('nenhum convite enviado');
    return chamada[0];
  }

  /** Convida o agente, define a senha pelo link e entra; devolve o agente e a sessão. */
  async function agenteLogado(gestor: string, email = 'joao@exemplo.test') {
    const convite = await requisitar('POST', 'admin/agentes', gestor, {
      nome: 'João Pereira',
      email,
    });
    expect(convite.statusCode).toBe(201);
    const agente = convite.json<Agente>();
    await requisitar('POST', 'auth/definir-senha', undefined, {
      token: ultimoConvite().token,
      senha: SENHA,
    });
    const entrada = await login(email);
    expect(entrada.statusCode).toBe(200);
    const refresh = entrada.cookies.find((cookie) => cookie.name === 'fa_refresh')!.value;
    const { access_token } = entrada.json<{ access_token: string }>();
    return { agente, refresh, accessToken: access_token };
  }

  describe('/admin/orgao', () => {
    it('o gestor vê e edita o nome e a sigla do órgão do próprio município', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);

      const atual = await requisitar('GET', 'admin/orgao', gestor);
      expect(atual.statusCode).toBe(200);
      expect(atual.json()).toEqual({
        id: orgaoSorocaba,
        municipio_id: SOROCABA.id,
        nome: 'Prefeitura de Sorocaba',
        sigla: 'PMS',
      });

      const editado = await requisitar('PATCH', 'admin/orgao', gestor, {
        nome: ' Secretaria de Serviços Públicos ',
        sigla: 'SSP',
      });
      expect(editado.statusCode).toBe(200);
      expect(editado.json()).toMatchObject({
        nome: 'Secretaria de Serviços Públicos',
        sigla: 'SSP',
      });
      expect(await prisma.orgao.findUniqueOrThrow({ where: { id: orgaoSorocaba } })).toMatchObject({
        nome: 'Secretaria de Serviços Públicos',
        sigla: 'SSP',
      });
    });

    it('o gestor de outro município só alcança o órgão dele', async () => {
      const gestorOutro = await token(Papel.ADMIN_MUNICIPIO, OUTRO.id);

      await requisitar('PATCH', 'admin/orgao', gestorOutro, { nome: 'Outro nome' });

      expect((await requisitar('GET', 'admin/orgao', gestorOutro)).json()).toMatchObject({
        id: orgaoOutro,
        nome: 'Outro nome',
      });
      expect(await prisma.orgao.findUniqueOrThrow({ where: { id: orgaoSorocaba } })).toMatchObject({
        nome: 'Prefeitura de Sorocaba',
      });
    });

    it('recusa sigla em minúsculas com 422, sem mudar o órgão', async () => {
      const resposta = await requisitar(
        'PATCH',
        'admin/orgao',
        await token(Papel.ADMIN_MUNICIPIO),
        {
          sigla: 'pms',
        },
      );

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({
        codigo: 'VALIDACAO',
        detalhes: { campos: { sigla: expect.any(Array) as unknown[] } },
      });
    });

    it.each([Papel.CIDADAO, Papel.AGENTE_ORGAO, Papel.ADMIN_PLATAFORMA])(
      '%s recebe 403 ACESSO_NEGADO',
      async (papel) => {
        const resposta = await requisitar('GET', 'admin/orgao', await token(papel));

        expect(resposta.statusCode).toBe(403);
        expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
      },
    );
  });

  describe('/admin/agentes', () => {
    it('o agente convidado define a senha pelo link e entra', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);

      const convite = await requisitar('POST', 'admin/agentes', gestor, {
        nome: 'João Pereira',
        email: 'joao@exemplo.test',
      });
      expect(convite.statusCode).toBe(201);
      expect(convite.json()).toEqual({
        id: expect.any(String) as string,
        nome: 'João Pereira',
        email: 'joao@exemplo.test',
        ativo: true,
        convite_pendente: true,
      });
      expect(emails.enviarConvite).toHaveBeenCalledWith(
        expect.objectContaining({
          para: 'joao@exemplo.test',
          papel: 'AGENTE_ORGAO',
          orgao: 'Prefeitura de Sorocaba',
        }),
      );
      expect((await login('joao@exemplo.test')).statusCode).toBe(401);

      const definida = await requisitar('POST', 'auth/definir-senha', undefined, {
        token: ultimoConvite().token,
        senha: SENHA,
      });
      expect(definida.statusCode).toBe(204);

      const entrada = await login('joao@exemplo.test');
      expect(entrada.statusCode).toBe(200);
      expect(entrada.json()).toMatchObject({
        usuario: {
          papel: 'AGENTE_ORGAO',
          municipio_id: SOROCABA.id,
          orgao_id: orgaoSorocaba,
        },
      });

      const lista = await requisitar('GET', 'admin/agentes', gestor);
      expect(lista.json()).toEqual([
        expect.objectContaining({ email: 'joao@exemplo.test', convite_pendente: false }),
      ]);
    });

    it('lista só os agentes do órgão do gestor, em ordem de nome', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);
      await requisitar('POST', 'admin/agentes', gestor, { nome: 'Zeca', email: 'z@exemplo.test' });
      await requisitar('POST', 'admin/agentes', gestor, { nome: 'Ana', email: 'a@exemplo.test' });
      await token(Papel.AGENTE_ORGAO, OUTRO.id);

      const lista = await requisitar('GET', 'admin/agentes', gestor);

      expect(lista.statusCode).toBe(200);
      // O agente do outro município fica de fora.
      expect(lista.json<Agente[]>().map((agente) => agente.nome)).toEqual(['Ana', 'Zeca']);
    });

    it('recusa e-mail que já tem conta com 409, sem enviar convite', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);
      await requisitar('POST', 'admin/agentes', gestor, { nome: 'João', email: 'j@exemplo.test' });
      vi.clearAllMocks();

      const repetido = await requisitar('POST', 'admin/agentes', gestor, {
        nome: 'Outro João',
        email: 'J@Exemplo.test',
      });

      expect(repetido.statusCode).toBe(409);
      expect(repetido.json()).toMatchObject({ codigo: 'EMAIL_EM_USO' });
      expect(emails.enviarConvite).not.toHaveBeenCalled();
    });

    it('desativar o agente faz o refresh dele devolver 401 na hora, e ele não entra mais', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);
      const { agente, refresh, accessToken } = await agenteLogado(gestor);

      const desativado = await requisitar('PATCH', `admin/agentes/${agente.id}`, gestor, {
        ativo: false,
      });
      expect(desativado.statusCode).toBe(200);
      expect(desativado.json()).toMatchObject({ id: agente.id, ativo: false });

      const renovacao = await renovar(refresh);
      expect(renovacao.statusCode).toBe(401);
      expect(renovacao.json()).toMatchObject({ codigo: 'SESSAO_INVALIDA' });
      expect((await requisitar('GET', 'me', accessToken)).statusCode).toBe(401);
      expect((await login(agente.email)).statusCode).toBe(401);
      expect(
        await prisma.refreshToken.count({ where: { usuarioId: agente.id, revogadoEm: null } }),
      ).toBe(0);
      // Os dados continuam lá.
      expect(await prisma.usuario.findUniqueOrThrow({ where: { id: agente.id } })).toMatchObject({
        ativo: false,
        senhaHash: expect.any(String) as string,
      });
    });

    it('reativar o agente permite entrar de novo', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);
      const { agente } = await agenteLogado(gestor);
      await requisitar('PATCH', `admin/agentes/${agente.id}`, gestor, { ativo: false });

      const reativado = await requisitar('PATCH', `admin/agentes/${agente.id}`, gestor, {
        ativo: true,
      });

      expect(reativado.statusCode).toBe(200);
      expect(reativado.json()).toMatchObject({ ativo: true });
      expect((await login(agente.email)).statusCode).toBe(200);
    });

    it('o gestor de outro município recebe 403 OUTRO_MUNICIPIO, e o agente continua ativo', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);
      const { agente, refresh } = await agenteLogado(gestor);
      const gestorOutro = await token(Papel.ADMIN_MUNICIPIO, OUTRO.id);

      const resposta = await requisitar('PATCH', `admin/agentes/${agente.id}`, gestorOutro, {
        ativo: false,
      });

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toMatchObject({ codigo: 'OUTRO_MUNICIPIO' });
      expect((await renovar(refresh)).statusCode).toBe(200);
      expect((await requisitar('GET', 'admin/agentes', gestorOutro)).json()).toEqual([]);
    });

    it('id que não é de agente devolve 404', async () => {
      const gestor = await token(Papel.ADMIN_MUNICIPIO);

      const inexistente = await requisitar('PATCH', `admin/agentes/${randomUUID()}`, gestor, {
        ativo: false,
      });
      const invalido = await requisitar('PATCH', 'admin/agentes/abc', gestor, { ativo: false });

      expect(inexistente.statusCode).toBe(404);
      expect(invalido.statusCode).toBe(404);
      expect(inexistente.json()).toMatchObject({ codigo: 'NAO_ENCONTRADO' });
    });

    it('agente e cidadão recebem 403 ACESSO_NEGADO', async () => {
      for (const papel of [Papel.AGENTE_ORGAO, Papel.CIDADAO]) {
        const resposta = await requisitar('POST', 'admin/agentes', await token(papel), {
          nome: 'Intruso',
          email: `${papel}@exemplo.test`,
        });
        expect(resposta.statusCode).toBe(403);
        expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
      }
      expect(await prisma.usuario.count({ where: { nome: 'Intruso' } })).toBe(0);
    });
  });

  describe('POST /admin/gestores', () => {
    it('o admin da plataforma convida o gestor, que define a senha, aceita a política e vê o órgão', async () => {
      const admin = await token(Papel.ADMIN_PLATAFORMA, null);

      const convite = await requisitar('POST', 'admin/gestores', admin, {
        nome: 'Carla Souza',
        email: 'carla@exemplo.test',
        municipio_id: SOROCABA.id,
      });
      expect(convite.statusCode).toBe(201);
      expect(convite.json()).toEqual({
        id: expect.any(String) as string,
        nome: 'Carla Souza',
        email: 'carla@exemplo.test',
        municipio_id: SOROCABA.id,
      });
      expect(ultimoConvite().papel).toBe('ADMIN_MUNICIPIO');

      await requisitar('POST', 'auth/definir-senha', undefined, {
        token: ultimoConvite().token,
        senha: SENHA,
      });
      const entrada = await login('carla@exemplo.test');
      expect(entrada.statusCode).toBe(200);
      const { access_token } = entrada.json<{ access_token: string }>();
      await requisitar('POST', 'me/politica', access_token, { versao: '1' });

      const orgao = await requisitar('GET', 'admin/orgao', access_token);
      expect(orgao.statusCode).toBe(200);
      expect(orgao.json()).toMatchObject({ id: orgaoSorocaba });
    });

    it('município inexistente devolve 422 MUNICIPIO_INEXISTENTE, sem criar a conta', async () => {
      const resposta = await requisitar(
        'POST',
        'admin/gestores',
        await token(Papel.ADMIN_PLATAFORMA, null),
        { nome: 'Carla Souza', email: 'carla@exemplo.test', municipio_id: 1 },
      );

      expect(resposta.statusCode).toBe(422);
      expect(resposta.json()).toMatchObject({ codigo: 'MUNICIPIO_INEXISTENTE' });
      expect(await prisma.usuario.count({ where: { email: 'carla@exemplo.test' } })).toBe(0);
    });

    it('o gestor do município recebe 403 ACESSO_NEGADO', async () => {
      const resposta = await requisitar(
        'POST',
        'admin/gestores',
        await token(Papel.ADMIN_MUNICIPIO),
        { nome: 'Carla Souza', email: 'carla@exemplo.test', municipio_id: OUTRO.id },
      );

      expect(resposta.statusCode).toBe(403);
      expect(resposta.json()).toMatchObject({ codigo: 'ACESSO_NEGADO' });
    });
  });
});
