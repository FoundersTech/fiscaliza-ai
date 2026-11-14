import { createHash, randomUUID } from 'node:crypto';

import { HeadObjectCommand, NotFound, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { FILA_MIDIA } from '../midia/application/fotos-enviadas.js';
import { configStorage, criarClienteS3 } from '../midia/infrastructure/storage-r2.adapter.js';
import { FILA_TERRITORIO } from '../ocorrencias/application/enderecos.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';
import { FILA_PRIVACIDADE } from './application/exportacoes.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };
const SENHA = 'senha-forte-1';
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

interface Conta {
  id: string;
  email: string;
  token: string;
}

interface Exportacao {
  id: string;
  status: string;
  solicitada_em: string;
  pronta_em?: string;
  expira_em?: string;
  download_url?: string;
}

interface ArquivoExportado {
  gerado_em: string;
  conta: { id: string; email: string; nome: string; apelido_publico: string };
  ocorrencias: { id: string; protocolo: string; descricao: string; local: unknown }[];
  confirmacoes: { ocorrencia_id: string; protocolo: string }[];
  avaliacoes: { ocorrencia_id: string; nota: number; comentario: string | null }[];
}

describe('Exportação de dados e exclusão de conta', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let s3: S3Client;
  let bucket: string;
  let filas: Queue[];
  let categoriaId: number;
  let maria: Conta;
  let joao: Conta;
  let daMaria: string;
  let doJoao: string;

  const url = (caminho: string) => `/${PREFIXO_API}${caminho}`;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function cadastrar(nome: string, email: string): Promise<Conta> {
    const resposta = await app.inject({
      method: 'POST',
      url: url('/auth/cadastro'),
      payload: {
        nome,
        apelido_publico: nome.toLowerCase(),
        email,
        senha: SENHA,
        politica_versao: '1',
      },
    });
    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ access_token: string; usuario: { id: string } }>();
    return { id: corpo.usuario.id, email, token: corpo.access_token };
  }

  async function registrar(conta: Conta, descricao: string): Promise<string> {
    const id = randomUUID();
    const chave = `ocorrencias/${id}/1-${randomUUID()}.jpg`;
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: chave, Body: 'jpeg', ContentType: 'image/jpeg' }),
    );
    const resposta = await app.inject({
      method: 'POST',
      url: url('/ocorrencias'),
      headers: bearer(conta.token),
      payload: {
        id,
        categoria_id: categoriaId,
        descricao,
        local: CENTRO,
        fotos: [{ upload_key: chave, ordem: 1 }],
        origem: 'ONLINE',
        forcar_criacao: true,
      },
    });
    expect(resposta.statusCode).toBe(201);
    return id;
  }

  async function confirmar(conta: Conta, ocorrenciaId: string): Promise<void> {
    const resposta = await app.inject({
      method: 'POST',
      url: url(`/ocorrencias/${ocorrenciaId}/confirmacoes`),
      headers: bearer(conta.token),
    });
    expect(resposta.statusCode).toBe(201);
  }

  function pedirExportacao(conta: Conta) {
    return app.inject({
      method: 'POST',
      url: url('/me/exportacoes'),
      headers: bearer(conta.token),
    });
  }

  function consultarExportacao(conta: Conta, id: string) {
    return app.inject({
      method: 'GET',
      url: url(`/me/exportacoes/${id}`),
      headers: bearer(conta.token),
    });
  }

  function exportacaoPronta(conta: Conta, id: string): Promise<Exportacao> {
    return vi.waitFor(
      async () => {
        const exportacao = (await consultarExportacao(conta, id)).json<Exportacao>();
        expect(exportacao.status).toBe('PRONTA');
        return exportacao;
      },
      { timeout: 10_000, interval: 100 },
    );
  }

  async function baixar(downloadUrl: string): Promise<ArquivoExportado> {
    const resposta = await fetch(downloadUrl);
    expect(resposta.status).toBe(200);
    return (await resposta.json()) as ArquivoExportado;
  }

  async function existeNoBucket(chave: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
      return true;
    } catch (erro) {
      if (erro instanceof NotFound) return false;
      throw erro;
    }
  }

  function excluir(conta: Conta, senha: string) {
    return app.inject({
      method: 'DELETE',
      url: url('/me'),
      headers: bearer(conta.token),
      payload: { senha },
    });
  }

  function login(email: string) {
    return app.inject({
      method: 'POST',
      url: url('/auth/login'),
      payload: { email, senha: SENHA },
    });
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GEOCODING_PORT)
      .useValue(geocoding)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    await aplicarCargaInicial(prisma);

    const config = configStorage(app.get<Ambiente>(AMBIENTE));
    s3 = criarClienteS3(config);
    bucket = config.bucketUploads;
    filas = [FILA_MIDIA, FILA_TERRITORIO, FILA_PRIVACIDADE].map((nome) =>
      app.get<Queue>(getQueueToken(nome)),
    );
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;
  });

  afterAll(async () => {
    for (const fila of filas) await fila.obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE usuario, ocorrencia, protocolo_sequencia RESTART IDENTITY CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    for (const fila of filas.slice(0, 2)) {
      await fila.obliterate({ force: true });
      // As fotos de mentira e os endereços ficam na fila, sem processamento.
      await fila.pause();
    }
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });

    maria = await cadastrar('Maria', 'maria@exemplo.test');
    joao = await cadastrar('Joao', 'joao@exemplo.test');
    daMaria = await registrar(maria, 'Poste apagado na rua da Maria');
    doJoao = await registrar(joao, 'Buraco enorme perto da casa do Joao');
    await confirmar(maria, doJoao);
    await confirmar(joao, daMaria);
    await prisma.avaliacao.createMany({
      data: [
        { ocorrenciaId: doJoao, usuarioId: maria.id, nota: 4, comentario: 'Resolveram rápido' },
        { ocorrenciaId: daMaria, usuarioId: joao.id, nota: 2, comentario: 'Avaliação do Joao' },
      ],
    });
  });

  describe('POST e GET /me/exportacoes', () => {
    it('exige login', async () => {
      const resposta = await app.inject({ method: 'POST', url: url('/me/exportacoes') });
      expect(resposta.statusCode).toBe(401);
    });

    it('o JSON tem a conta, as ocorrências, as confirmações e as avaliações do usuário, e de mais ninguém', async () => {
      const pedido = await pedirExportacao(maria);
      expect(pedido.statusCode).toBe(202);
      const { id } = pedido.json<{ id: string }>();

      const pronta = await exportacaoPronta(maria, id);
      expect(pronta.download_url).toEqual(expect.any(String));
      const arquivo = await baixar(pronta.download_url as string);

      expect(arquivo.conta).toMatchObject({ id: maria.id, email: maria.email, nome: 'Maria' });
      expect(arquivo.ocorrencias.map((ocorrencia) => ocorrencia.id)).toEqual([daMaria]);
      expect(arquivo.ocorrencias[0]).toMatchObject({
        descricao: 'Poste apagado na rua da Maria',
        local: CENTRO,
      });
      expect(arquivo.confirmacoes.map((confirmacao) => confirmacao.ocorrencia_id)).toEqual([
        doJoao,
      ]);
      expect(arquivo.avaliacoes).toEqual([
        expect.objectContaining({
          ocorrencia_id: doJoao,
          nota: 4,
          comentario: 'Resolveram rápido',
        }),
      ]);

      const texto = JSON.stringify(arquivo);
      expect(texto).not.toContain(joao.id);
      expect(texto).not.toContain(joao.email);
      expect(texto).not.toContain('Buraco enorme');
      expect(texto).not.toContain('Avaliação do Joao');
    });

    it('grava o arquivo no bucket privado, fora das fotos, e o prazo é de 7 dias', async () => {
      const { id } = (await pedirExportacao(maria)).json<{ id: string }>();
      const pronta = await exportacaoPronta(maria, id);

      const gravada = await prisma.exportacaoDados.findUniqueOrThrow({ where: { id } });
      expect(gravada.storageKey).toBe(`exportacoes/${maria.id}/${id}.json`);
      expect(await existeNoBucket(gravada.storageKey as string)).toBe(true);
      expect(gravada.expiraEm?.getTime()).toBe((gravada.prontaEm?.getTime() ?? 0) + SETE_DIAS_MS);
      expect(pronta.expira_em).toBe(gravada.expiraEm?.toISOString());

      // O link é pré-assinado por 15 minutos.
      const link = new URL(pronta.download_url as string);
      expect(link.searchParams.get('X-Amz-Expires')).toBe('900');
    });

    it('pedir de novo com uma em andamento ou pronta devolve a mesma', async () => {
      const [primeiro, segundo] = await Promise.all([
        pedirExportacao(maria),
        pedirExportacao(maria),
      ]);
      const { id } = primeiro.json<{ id: string }>();
      expect(segundo.json<{ id: string }>().id).toBe(id);

      await exportacaoPronta(maria, id);
      const depois = await pedirExportacao(maria);
      expect(depois.statusCode).toBe(202);
      expect(depois.json()).toEqual({ id, status: 'PRONTA' });
      expect(await prisma.exportacaoDados.count({ where: { usuarioId: maria.id } })).toBe(1);
    });

    it('com o prazo vencido, aparece como expirada, sem link, e um novo pedido cria outra', async () => {
      const { id } = (await pedirExportacao(maria)).json<{ id: string }>();
      await exportacaoPronta(maria, id);
      await prisma.exportacaoDados.update({
        where: { id },
        data: { expiraEm: new Date(Date.now() - 1000) },
      });

      const vencida = (await consultarExportacao(maria, id)).json<Exportacao>();
      expect(vencida.status).toBe('EXPIRADA');
      expect(vencida).not.toHaveProperty('download_url');

      const nova = (await pedirExportacao(maria)).json<{ id: string }>();
      expect(nova.id).not.toBe(id);
    });

    it('a exportação de outra pessoa responde 404', async () => {
      const { id } = (await pedirExportacao(maria)).json<{ id: string }>();

      const resposta = await consultarExportacao(joao, id);
      expect(resposta.statusCode).toBe(404);
      expect(resposta.json()).toMatchObject({ codigo: 'EXPORTACAO_NAO_ENCONTRADA' });
      expect((await consultarExportacao(maria, 'nao-e-uuid')).statusCode).toBe(404);
    });

    it('GET /me/exportacoes lista só as do usuário, das mais recentes para as mais antigas', async () => {
      const { id } = (await pedirExportacao(maria)).json<{ id: string }>();
      await exportacaoPronta(maria, id);
      await prisma.exportacaoDados.update({ where: { id }, data: { status: 'EXPIRADA' } });
      const { id: nova } = (await pedirExportacao(maria)).json<{ id: string }>();
      await pedirExportacao(joao);

      const lista = await app.inject({
        method: 'GET',
        url: url('/me/exportacoes'),
        headers: bearer(maria.token),
      });
      expect(lista.statusCode).toBe(200);
      expect(lista.json<Exportacao[]>().map((exportacao) => exportacao.id)).toEqual([nova, id]);
    });
  });

  describe('DELETE /me', () => {
    it('com a senha errada responde 401 SENHA_INCORRETA e não muda nada', async () => {
      const resposta = await excluir(maria, 'senha-errada-1');

      expect(resposta.statusCode).toBe(401);
      expect(resposta.json()).toMatchObject({ codigo: 'SENHA_INCORRETA' });
      expect((await login(maria.email)).statusCode).toBe(200);
    });

    it('depois da exclusão, o login dá 401 e as ocorrências continuam públicas, sem autor', async () => {
      const resposta = await excluir(maria, SENHA);
      expect(resposta.statusCode).toBe(204);
      expect(String(resposta.headers['set-cookie'])).toContain('fa_refresh=;');

      const entrada = await login(maria.email);
      expect(entrada.statusCode).toBe(401);
      expect(entrada.json()).toMatchObject({ codigo: 'CREDENCIAIS_INVALIDAS' });
      const perfil = await app.inject({
        method: 'GET',
        url: url('/me'),
        headers: bearer(maria.token),
      });
      expect(perfil.statusCode).toBe(401);

      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: maria.id } });
      expect(usuario).toMatchObject({
        nome: 'Usuário removido',
        email: `removido+${maria.id}@invalid`,
        senhaHash: null,
        ativo: false,
      });
      expect(usuario.anonimizadoEm).toBeInstanceOf(Date);
      expect(usuario.apelidoPublico).not.toBe('maria');

      const ocorrencia = await prisma.ocorrencia.findUniqueOrThrow({ where: { id: daMaria } });
      expect(ocorrencia.autorId).toBeNull();
      const detalhe = await app.inject({ method: 'GET', url: url(`/ocorrencias/${daMaria}`) });
      expect(detalhe.statusCode).toBe(200);
      expect(detalhe.json()).not.toHaveProperty('autor_apelido');
      expect(detalhe.body).not.toContain('maria');

      // As confirmações e avaliações ficam, para manter contagens e score.
      expect(await prisma.confirmacao.count({ where: { usuarioId: maria.id } })).toBe(1);
      expect(await prisma.avaliacao.count({ where: { usuarioId: maria.id } })).toBe(1);
      // Os dados do João não mudam.
      expect((await prisma.ocorrencia.findUniqueOrThrow({ where: { id: doJoao } })).autorId).toBe(
        joao.id,
      );
      expect((await login(joao.email)).statusCode).toBe(200);
    });

    it('apaga as inscrições de push, os tokens e as exportações do usuário, com o arquivo', async () => {
      const { id } = (await pedirExportacao(maria)).json<{ id: string }>();
      await exportacaoPronta(maria, id);
      const chave = `exportacoes/${maria.id}/${id}.json`;
      expect((await login(maria.email)).statusCode).toBe(200);
      const hash = (texto: string) => createHash('sha256').update(texto).digest('hex');
      await prisma.tokenAcesso.create({
        data: {
          usuarioId: maria.id,
          tipo: 'REDEFINIR_SENHA',
          tokenHash: hash(randomUUID()),
          expiraEm: new Date(Date.now() + 3_600_000),
        },
      });
      for (const conta of [maria, joao]) {
        await prisma.pushInscricao.create({
          data: {
            usuarioId: conta.id,
            endpoint: `https://push.exemplo.test/${conta.id}`,
            p256dh: 'chave',
            auth: 'segredo',
          },
        });
      }

      expect((await excluir(maria, SENHA)).statusCode).toBe(204);

      expect(await prisma.pushInscricao.count({ where: { usuarioId: maria.id } })).toBe(0);
      expect(await prisma.refreshToken.count({ where: { usuarioId: maria.id } })).toBe(0);
      expect(await prisma.tokenAcesso.count({ where: { usuarioId: maria.id } })).toBe(0);
      expect(await prisma.exportacaoDados.count({ where: { usuarioId: maria.id } })).toBe(0);
      expect(await existeNoBucket(chave)).toBe(false);
      // Os do João continuam.
      expect(await prisma.pushInscricao.count({ where: { usuarioId: joao.id } })).toBe(1);
      expect(await prisma.refreshToken.count({ where: { usuarioId: joao.id } })).toBeGreaterThan(0);
    });

    it('o e-mail da conta excluída pode ser usado num novo cadastro', async () => {
      expect((await excluir(maria, SENHA)).statusCode).toBe(204);

      const nova = await cadastrar('Maria', maria.email);
      expect(nova.id).not.toBe(maria.id);
    });
  });
});
