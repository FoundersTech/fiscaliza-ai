import { randomUUID } from 'node:crypto';

import {
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fotoDeCelular, fotoPequena, MODELO_CAMERA } from '../../../test/fotos.js';
import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial } from '../../cli/seed/carga-inicial.js';
import { AMBIENTE, type Ambiente } from '../../shared/config/ambiente.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import {
  FILA_MANUTENCAO,
  JOB_RECONCILIAR,
  Reconciliar,
} from '../manutencao/application/reconciliar.js';
import { FILA_TERRITORIO } from '../ocorrencias/application/enderecos.js';
import { GEOCODING_PORT, type GeocodingPort } from '../territorio/application/portas.js';
import { FILA_MIDIA } from './application/fotos-enviadas.js';
import { chavesPublicas } from './domain/foto.js';
import {
  type ConfigStorage,
  configStorage,
  criarClienteS3,
} from './infrastructure/storage-r2.adapter.js';

const CENTRO = { lat: -23.5015, lng: -47.4526 };

const geocoding = { enderecoDe: vi.fn<GeocodingPort['enderecoDe']>() };

function minutosAtras(minutos: number): Date {
  return new Date(Date.now() - minutos * 60_000);
}

describe('fotos: processamento e reconciliação', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let s3: S3Client;
  let config: ConfigStorage;
  let filaFotos: Queue;
  let filaEnderecos: Queue;
  let token: string;
  let categoriaId: number;

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
    await aplicarCargaInicial(prisma);

    config = configStorage(app.get<Ambiente>(AMBIENTE));
    s3 = criarClienteS3(config);
    filaFotos = app.get<Queue>(getQueueToken(FILA_MIDIA));
    filaEnderecos = app.get<Queue>(getQueueToken(FILA_TERRITORIO));

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const redis = app.get<Redis>(REDIS);
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    const cadastro = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/auth/cadastro`,
      payload: {
        nome: 'Maria da Silva',
        apelido_publico: 'maria.s',
        email: 'maria@exemplo.test',
        senha: 'senha-forte-1',
        politica_versao: '1',
      },
    });
    token = cadastro.json<{ access_token: string }>().access_token;
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;
  });

  afterAll(async () => {
    await filaFotos.obliterate({ force: true });
    await filaEnderecos.obliterate({ force: true });
    s3.destroy();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    geocoding.enderecoDe.mockReset();
    geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua A', numero: '1', bairro: 'Centro' });
  });

  /** O caminho do PWA, mas sem a compressão no aparelho: intenção, PUT no link e registro. */
  async function registrarComFoto(conteudo: Buffer) {
    const autorizacao = { authorization: `Bearer ${token}` };
    const ocorrenciaId = randomUUID();
    const intencao = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/uploads/intencao`,
      payload: {
        ocorrencia_id: ocorrenciaId,
        ordem: 1,
        content_type: 'image/jpeg',
        bytes: conteudo.length,
      },
      headers: autorizacao,
    });
    expect(intencao.statusCode).toBe(201);
    const { upload_url, upload_key } = intencao.json<{ upload_url: string; upload_key: string }>();
    const envio = await fetch(upload_url, {
      method: 'PUT',
      body: new Uint8Array(conteudo),
      headers: { 'content-type': 'image/jpeg' },
    });
    expect(envio.status).toBe(200);
    const registro = await app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/ocorrencias`,
      payload: {
        id: ocorrenciaId,
        categoria_id: categoriaId,
        descricao: 'Poste apagado há uma semana na esquina',
        local: CENTRO,
        fotos: [{ upload_key, ordem: 1 }],
        origem: 'OFFLINE',
      },
      headers: autorizacao,
    });
    expect(registro.statusCode).toBe(201);
    const foto = await prisma.ocorrenciaFoto.findFirstOrThrow({ where: { ocorrenciaId } });
    return { ocorrenciaId, fotoId: foto.id, uploadKey: upload_key };
  }

  function fotoProcessada(fotoId: string) {
    return vi.waitFor(
      async () => {
        const foto = await prisma.ocorrenciaFoto.findUniqueOrThrow({ where: { id: fotoId } });
        expect(foto.moderacao).not.toBe('PENDENTE');
        expect(foto.uploadKey).toBeNull();
        return foto;
      },
      { timeout: 10_000, interval: 100 },
    );
  }

  async function existeOriginal(chave: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: config.bucketUploads, Key: chave }));
      return true;
    } catch (erro) {
      if (erro instanceof NotFound) return false;
      throw erro;
    }
  }

  /** O bucket de fotos local é público para leitura, como o do R2. */
  async function baixarPublica(chave: string) {
    const resposta = await fetch(`${config.endpoint}/${config.bucketFotos}/${chave}`);
    return { resposta, conteudo: Buffer.from(await resposta.arrayBuffer()) };
  }

  describe('midia.processar-foto', () => {
    it('foto com EXIF de GPS sai na URL pública sem GPS, modelo e data, e o original some', async () => {
      const original = await fotoDeCelular();
      const { ocorrenciaId, fotoId, uploadKey } = await registrarComFoto(original);

      const foto = await fotoProcessada(fotoId);

      const chaves = chavesPublicas(ocorrenciaId, fotoId);
      expect(foto).toMatchObject({
        moderacao: 'APROVADA',
        storageKey: chaves.foto,
        miniaturaKey: chaves.miniatura,
        largura: 1200,
        altura: 1600,
        motivoRejeicao: null,
      });
      expect(foto.exifRemovidoEm).toBeInstanceOf(Date);

      const { resposta, conteudo } = await baixarPublica(chaves.foto);
      expect(resposta.status).toBe(200);
      expect(resposta.headers.get('content-type')).toBe('image/jpeg');
      expect(resposta.headers.get('cache-control')).toBe('public, max-age=600');
      expect(conteudo.length).toBe(foto.bytes);
      const metadados = await sharp(conteudo).metadata();
      expect([metadados.width, metadados.height]).toEqual([1200, 1600]);
      expect(metadados).not.toHaveProperty('exif');
      expect(conteudo.includes('Exif')).toBe(false);
      expect(conteudo.includes(MODELO_CAMERA)).toBe(false);

      const miniatura = await sharp((await baixarPublica(chaves.miniatura)).conteudo).metadata();
      expect([miniatura.width, miniatura.height]).toEqual([300, 400]);

      expect(await existeOriginal(uploadKey)).toBe(false);
    });

    it('um .txt renomeado para .jpg vira REJEITADA, nada é publicado e o original some', async () => {
      const texto = Buffer.from('isto é um arquivo de texto com a extensão trocada para .jpg');
      const { ocorrenciaId, fotoId, uploadKey } = await registrarComFoto(texto);

      const foto = await fotoProcessada(fotoId);

      expect(foto).toMatchObject({
        moderacao: 'REJEITADA',
        motivoRejeicao: 'O arquivo enviado não é uma imagem.',
        storageKey: null,
        miniaturaKey: null,
      });
      const publicadas = await s3.send(
        new ListObjectsV2Command({
          Bucket: config.bucketFotos,
          Prefix: `ocorrencias/${ocorrenciaId}/`,
        }),
      );
      expect(publicadas.KeyCount).toBe(0);
      expect(await existeOriginal(uploadKey)).toBe(false);
    });
  });

  describe('manutencao.reconciliar', () => {
    it('fica agendada a cada 10 min', async () => {
      const filaManutencao = app.get<Queue>(getQueueToken(FILA_MANUTENCAO));

      await vi.waitFor(async () => {
        expect(await filaManutencao.getJobScheduler(JOB_RECONCILIAR)).toMatchObject({
          every: 600_000,
        });
      });
    });

    it('uma foto PENDENTE há 11 min sem job é reenfileirada; a de 9 min, não', async () => {
      await filaFotos.pause();
      let antiga: { fotoId: string };
      try {
        antiga = await registrarComFoto(await fotoPequena());
        const recente = await registrarComFoto(await fotoPequena());
        // Como se o Redis estivesse fora do ar na hora de enfileirar.
        await filaFotos.remove(`foto-${antiga.fotoId}`);
        await filaFotos.remove(`foto-${recente.fotoId}`);
        await prisma.ocorrenciaFoto.update({
          where: { id: antiga.fotoId },
          data: { criadaEm: minutosAtras(11) },
        });
        await prisma.ocorrenciaFoto.update({
          where: { id: recente.fotoId },
          data: { criadaEm: minutosAtras(9) },
        });

        await app.get(Reconciliar).executar();

        expect(await filaFotos.getJob(`foto-${antiga.fotoId}`)).toBeDefined();
        expect(await filaFotos.getJob(`foto-${recente.fotoId}`)).toBeUndefined();
      } finally {
        await filaFotos.resume();
      }
      expect(await fotoProcessada(antiga.fotoId)).toMatchObject({ moderacao: 'APROVADA' });
    });

    it('uma ocorrência sem endereço há 11 min sem job volta para a fila e ganha o endereço', async () => {
      await filaEnderecos.pause();
      let ocorrenciaId: string;
      try {
        geocoding.enderecoDe.mockRejectedValue(new Error('Nominatim respondeu 503'));
        ({ ocorrenciaId } = await registrarComFoto(await fotoPequena()));
        await filaEnderecos.remove(`endereco-${ocorrenciaId}`);
        await prisma.ocorrencia.update({
          where: { id: ocorrenciaId },
          data: { criadaEm: minutosAtras(11) },
        });
        geocoding.enderecoDe.mockResolvedValue({ rua: 'Rua B', numero: '2', bairro: null });

        await app.get(Reconciliar).executar();

        expect(await filaEnderecos.getJob(`endereco-${ocorrenciaId}`)).toBeDefined();
      } finally {
        await filaEnderecos.resume();
      }
      await vi.waitFor(
        async () => {
          const gravada = await prisma.ocorrencia.findUniqueOrThrow({
            where: { id: ocorrenciaId },
          });
          expect(gravada.endereco).toBe('Rua B, 2');
        },
        { timeout: 5000, interval: 100 },
      );
    });
  });
});
