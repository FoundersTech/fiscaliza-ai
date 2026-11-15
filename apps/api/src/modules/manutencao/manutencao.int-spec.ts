import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { comandoPostgres } from '../../../test/postgres-cli.js';
import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import {
  type ConfigStorage,
  configStorage,
  criarClienteS3,
} from '../midia/infrastructure/storage-r2.adapter.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';
import { AGENDA_BACKUP, JOB_BACKUP } from './application/fazer-backup.js';
import { AGENDA_LIMPEZA, JOB_LIMPEZA, Limpeza } from './application/limpeza.js';
import { GERADOR_DUMP } from './application/portas.js';
import { FILA_MANUTENCAO } from './application/reconciliar.js';
import { chaveBackup } from './domain/backup.js';
import { PgDump, restaurarDump } from './infrastructure/pg-dump.adapter.js';

const HORA_MS = 60 * 60_000;
const DIA_MS = 24 * HORA_MS;
const CENTRO = { lat: -23.5015, lng: -47.4526 };
const MARIA = { email: 'maria@exemplo.test', senha: 'senha-forte-1' };

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

function api(caminho: string): string {
  return `/${PREFIXO_API}/${caminho}`;
}

async function criarApp(ambiente?: Ambiente): Promise<NestFastifyApplication> {
  let construtor = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GEOCODING_PORT)
    .useValue(geocoding);
  if (ambiente) {
    construtor = construtor
      .overrideProvider(AMBIENTE)
      .useValue(ambiente)
      // O banco restaurado é copiado com o pg_dump do PATH ou do container, como na suíte.
      .overrideProvider(GERADOR_DUMP)
      .useValue(new PgDump(ambiente.DATABASE_URL, comandoPostgres('pg_dump')));
  } else {
    construtor = construtor.overrideProvider(GERADOR_DUMP).useFactory({
      inject: [AMBIENTE],
      factory: (ambienteDaSuite: Ambiente) =>
        new PgDump(ambienteDaSuite.DATABASE_URL, comandoPostgres('pg_dump')),
    });
  }
  const modulo = await construtor.compile();
  const app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await configurarApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('manutenção: limpeza e backup', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let ambiente: Ambiente;
  let config: ConfigStorage;
  let s3: S3Client;
  let fila: Queue;
  let usuarioId: string;
  let categoriaId: number;

  beforeAll(async () => {
    app = await criarApp();
    prisma = app.get(PrismaService);
    await aplicarCargaInicial(prisma);
    ambiente = app.get<Ambiente>(AMBIENTE);
    config = configStorage(ambiente);
    s3 = criarClienteS3(config);
    fila = app.get<Queue>(getQueueToken(FILA_MANUTENCAO));

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    await app.inject({
      method: 'POST',
      url: api('auth/cadastro'),
      payload: {
        nome: 'Maria da Silva',
        apelido_publico: 'maria.s',
        politica_versao: '1',
        ...MARIA,
      },
    });
    usuarioId = (await prisma.usuario.findFirstOrThrow({ where: { email: MARIA.email } })).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;
  });

  afterAll(async () => {
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia, exportacao_dados CASCADE`;
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
  });

  async function existe(bucket: string, chave: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
      return true;
    } catch (erro) {
      if (erro instanceof NotFound) return false;
      throw erro;
    }
  }

  async function gravar(bucket: string, chave: string, conteudo = 'x'): Promise<void> {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: chave, Body: conteudo }));
  }

  /** Uma ocorrência com a foto ainda PENDENTE: o upload é o original dela. Sem jobs na fila. */
  async function registrarComFoto(): Promise<string> {
    const ocorrenciaId = randomUUID();
    const uploadKey = `ocorrencias/${ocorrenciaId}/1-${randomUUID()}.jpg`;
    await gravar(config.bucketUploads, uploadKey);
    const protocolo = `FA-2026-SOR-${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    const municipioId = (await prisma.municipio.findFirstOrThrow()).id;
    const orgaoId = (await prisma.orgao.findFirstOrThrow()).id;
    // O local é geográfico (PostGIS), que o Prisma não grava.
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id, descricao, local)
      VALUES (${ocorrenciaId}::uuid, ${protocolo}, ${usuarioId}::uuid, ${categoriaId}, ${municipioId},
        ${orgaoId}, 'Poste apagado há uma semana na esquina',
        ST_SetSRID(ST_MakePoint(${CENTRO.lng}, ${CENTRO.lat}), 4326)::geography)`;
    await prisma.ocorrenciaFoto.create({ data: { ocorrenciaId, ordem: 1, uploadKey } });
    return uploadKey;
  }

  it('agenda a limpeza às 03:00 e o backup às 04:00 de São Paulo', async () => {
    await vi.waitFor(async () => {
      expect(await fila.getJobScheduler(JOB_LIMPEZA)).toMatchObject({
        pattern: AGENDA_LIMPEZA,
        tz: 'America/Sao_Paulo',
      });
      expect(await fila.getJobScheduler(JOB_BACKUP)).toMatchObject({
        pattern: AGENDA_BACKUP,
        tz: 'America/Sao_Paulo',
      });
    });
  });

  describe('limpeza', () => {
    it('um upload órfão de 25 h some; com 23 h, ou sendo o original de uma foto, fica', async () => {
      const orfao = `ocorrencias/${randomUUID()}/1-${randomUUID()}.jpg`;
      await gravar(config.bucketUploads, orfao);
      const emUso = await registrarComFoto();
      const fora = `exportacoes/${randomUUID()}.json`;
      await gravar(config.bucketUploads, fora);
      const limpeza = app.get(Limpeza);

      // O relógio da limpeza anda para a frente: os arquivos acabaram de ser gravados.
      await limpeza.executar(new Date(Date.now() + 23 * HORA_MS));
      expect(await existe(config.bucketUploads, orfao)).toBe(true);

      const resultado = await limpeza.executar(new Date(Date.now() + 25 * HORA_MS));
      expect(resultado.uploads).toBeGreaterThanOrEqual(1);
      expect(await existe(config.bucketUploads, orfao)).toBe(false);
      expect(await existe(config.bucketUploads, emUso)).toBe(true);
      // Fora do prefixo das fotos (as exportações, por exemplo), nada é apagado.
      expect(await existe(config.bucketUploads, fora)).toBe(true);
    });

    it('o job apaga tokens expirados há mais de 30 dias e expira as exportações vencidas', async () => {
      const agora = Date.now();
      const familiaId = randomUUID();
      const sessao = (dias: number, ip: string) => ({
        usuarioId,
        familiaId,
        tokenHash: randomUUID(),
        expiraEm: new Date(agora - dias * DIA_MS),
        ip,
        userAgent: 'Mozilla/5.0',
      });
      const velha = await prisma.refreshToken.create({ data: sessao(31, '203.0.113.1') });
      const recente = await prisma.refreshToken.create({ data: sessao(29, '203.0.113.2') });
      const linkVelho = await prisma.tokenAcesso.create({
        data: {
          usuarioId,
          tipo: 'REDEFINIR_SENHA',
          tokenHash: randomUUID(),
          expiraEm: new Date(agora - 31 * DIA_MS),
        },
      });

      const arquivoVencido = `exportacoes/${randomUUID()}.json`;
      await gravar(config.bucketUploads, arquivoVencido, '{}');
      const vencida = await prisma.exportacaoDados.create({
        data: {
          usuarioId,
          status: 'PRONTA',
          storageKey: arquivoVencido,
          prontaEm: new Date(agora - 8 * DIA_MS),
          expiraEm: new Date(agora - DIA_MS),
        },
      });
      const arquivoValido = `exportacoes/${randomUUID()}.json`;
      await gravar(config.bucketUploads, arquivoValido, '{}');
      const valida = await prisma.exportacaoDados.create({
        data: {
          usuarioId,
          status: 'PRONTA',
          storageKey: arquivoValido,
          prontaEm: new Date(agora - DIA_MS),
          expiraEm: new Date(agora + 6 * DIA_MS),
        },
      });

      await fila.add(JOB_LIMPEZA, {}, { removeOnComplete: true });

      await vi.waitFor(
        async () => {
          expect(await prisma.refreshToken.findUnique({ where: { id: velha.id } })).toBeNull();
        },
        { timeout: 10_000, interval: 100 },
      );
      expect(await prisma.refreshToken.findUnique({ where: { id: recente.id } })).not.toBeNull();
      expect(await prisma.tokenAcesso.findUnique({ where: { id: linkVelho.id } })).toBeNull();
      await vi.waitFor(async () => {
        expect(
          await prisma.exportacaoDados.findUniqueOrThrow({ where: { id: vencida.id } }),
        ).toMatchObject({ status: 'EXPIRADA', storageKey: null });
      });
      expect(await existe(config.bucketUploads, arquivoVencido)).toBe(false);
      expect(
        await prisma.exportacaoDados.findUniqueOrThrow({ where: { id: valida.id } }),
      ).toMatchObject({ status: 'PRONTA', storageKey: arquivoValido });
      expect(await existe(config.bucketUploads, arquivoValido)).toBe(true);
    });
  });

  describe('backup', () => {
    const banco = `${new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1)}_restaurado`;
    let restaurada: NestFastifyApplication | undefined;

    async function noBancoPostgres(sql: (cliente: pg.Client) => Promise<unknown>) {
      const url = new URL(ambiente.DATABASE_URL);
      url.pathname = '/postgres';
      const cliente = new pg.Client({ connectionString: url.href });
      await cliente.connect();
      try {
        await sql(cliente);
      } finally {
        await cliente.end();
      }
    }

    afterAll(async () => {
      await restaurada?.close();
      await noBancoPostgres((cliente) =>
        cliente.query(`DROP DATABASE IF EXISTS ${cliente.escapeIdentifier(banco)} WITH (FORCE)`),
      );
    });

    it('o job grava o backup do dia, guarda 7 dias e o backup restaurado num banco vazio sobe a API', async () => {
      const agora = new Date();
      const chaveDoDia = chaveBackup(agora);
      const seteDias = chaveBackup(new Date(agora.getTime() - 7 * DIA_MS));
      const seisDias = chaveBackup(new Date(agora.getTime() - 6 * DIA_MS));
      // Um backup de hoje que já existia é substituído.
      await gravar(config.bucketBackup, chaveDoDia, 'anterior');
      await gravar(config.bucketBackup, seteDias);
      await gravar(config.bucketBackup, seisDias);
      await registrarComFoto();

      await fila.add(JOB_BACKUP, {}, { removeOnComplete: true });

      let dump: Buffer = Buffer.alloc(0);
      await vi.waitFor(
        async () => {
          const resposta = await s3.send(
            new GetObjectCommand({ Bucket: config.bucketBackup, Key: chaveDoDia }),
          );
          dump = Buffer.from((await resposta.Body?.transformToByteArray()) ?? []);
          // Formato custom do pg_dump.
          expect(dump.subarray(0, 5).toString()).toBe('PGDMP');
        },
        { timeout: 60_000, interval: 250 },
      );
      await vi.waitFor(async () => {
        expect(await existe(config.bucketBackup, seteDias)).toBe(false);
      });
      expect(await existe(config.bucketBackup, seisDias)).toBe(true);

      // Restauração num banco vazio.
      await noBancoPostgres(async (cliente) => {
        const nome = cliente.escapeIdentifier(banco);
        await cliente.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
        await cliente.query(`CREATE DATABASE ${nome}`);
      });
      const urlRestaurada = new URL(ambiente.DATABASE_URL);
      urlRestaurada.pathname = `/${banco}`;
      const arquivo = join(tmpdir(), `restauracao-${randomUUID()}.dump`);
      await writeFile(arquivo, dump);
      try {
        await restaurarDump(arquivo, urlRestaurada.href, comandoPostgres('pg_restore'));
      } finally {
        await rm(arquivo, { force: true });
      }

      restaurada = await criarApp({ ...ambiente, DATABASE_URL: urlRestaurada.href });
      const saude = await restaurada.inject({ method: 'GET', url: api('health') });
      expect(saude.statusCode).toBe(200);
      const login = await restaurada.inject({
        method: 'POST',
        url: api('auth/login'),
        payload: MARIA,
      });
      expect(login.statusCode).toBe(200);
      const perfil = await restaurada.inject({
        method: 'GET',
        url: api('me'),
        headers: { authorization: `Bearer ${login.json<{ access_token: string }>().access_token}` },
      });
      expect(perfil.json()).toMatchObject({ email: MARIA.email });
      const ocorrencias = await restaurada.get(PrismaService).ocorrencia.count();
      expect(ocorrencias).toBe(await prisma.ocorrencia.count());
      expect(ocorrencias).toBeGreaterThan(0);
    }, 120_000);
  });
});
