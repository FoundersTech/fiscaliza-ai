import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../../app.module.js';
import { configurarApp, PREFIXO_API } from '../../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../../cli/seed/carga-inicial.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { REDIS } from '../../shared/redis/redis.module.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../identidade/application/portas.js';
import { Papel } from '../identidade/domain/papel.js';
import { FILA_NOTIFICACOES, FilaNotificacoes } from './application/fila-notificacoes.js';
import { PUSH_PORT, type PushPort } from './application/push.port.js';

describe('notificações web push', () => {
  const enviarPush = vi.fn<PushPort['enviar']>();
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let fila: Queue;
  let tokens: EmissorToken;
  let cidadaoId: string;
  let cidadaoToken: string;
  let outroCidadaoId: string;
  let outroCidadaoToken: string;
  let agenteId: string;
  let agenteToken: string;
  let orgaoId: number;
  let categoriaId: number;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PUSH_PORT)
      .useValue({ enviar: enviarPush })
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);
    fila = app.get<Queue>(getQueueToken(FILA_NOTIFICACOES));
    tokens = app.get<EmissorToken>(EMISSOR_TOKEN);
    await aplicarCargaInicial(prisma);
    orgaoId = (await prisma.orgao.findFirstOrThrow({ where: { municipioId: SOROCABA.id } })).id;
    categoriaId = (await prisma.categoria.findFirstOrThrow({ where: { slug: 'iluminacao' } })).id;

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const cidadao = await prisma.usuario.create({
      data: {
        nome: 'Ana Cidadã',
        apelidoPublico: 'ana',
        email: 'ana.push@exemplo.test',
        senhaHash: 'sem-uso',
        papel: 'CIDADAO',
        politicaVersao: '1',
        politicaAceitaEm: new Date(),
      },
    });
    const outro = await prisma.usuario.create({
      data: {
        nome: 'Beto Cidadão',
        apelidoPublico: 'beto',
        email: 'beto.push@exemplo.test',
        senhaHash: 'sem-uso',
        papel: 'CIDADAO',
        politicaVersao: '1',
        politicaAceitaEm: new Date(),
      },
    });
    const agente = await prisma.usuario.create({
      data: {
        nome: 'Carlos Agente',
        apelidoPublico: 'carlos',
        email: 'carlos.push@exemplo.test',
        senhaHash: 'sem-uso',
        papel: 'AGENTE_ORGAO',
        municipioId: SOROCABA.id,
        orgaoId,
        politicaVersao: '1',
        politicaAceitaEm: new Date(),
      },
    });
    cidadaoId = cidadao.id;
    outroCidadaoId = outro.id;
    agenteId = agente.id;
    cidadaoToken = await tokens.emitir({
      usuarioId: cidadaoId,
      papel: Papel.CIDADAO,
      municipioId: null,
      orgaoId: null,
    });
    outroCidadaoToken = await tokens.emitir({
      usuarioId: outroCidadaoId,
      papel: Papel.CIDADAO,
      municipioId: null,
      orgaoId: null,
    });
    agenteToken = await tokens.emitir({
      usuarioId: agenteId,
      papel: Papel.AGENTE_ORGAO,
      municipioId: SOROCABA.id,
      orgaoId,
    });
  });

  afterAll(async () => {
    await fila.obliterate({ force: true });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, push_inscricao, protocolo_sequencia CASCADE`;
    await fila.obliterate({ force: true });
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    enviarPush.mockReset();
    enviarPush.mockResolvedValue('ENVIADO');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POST e DELETE /me/push exigem cidadão, gravam, atualizam e removem a inscrição', async () => {
    const semLogin = await app.inject({
      method: 'POST',
      url: `${PREFIXO_API}/me/push`,
      payload: {
        endpoint: 'https://push.exemplo.test/sub-1',
        keys: { p256dh: 'p1', auth: 'a1' },
      },
    });
    expect(semLogin.statusCode).toBe(401);

    const agenteNegado = await app.inject({
      method: 'POST',
      url: `${PREFIXO_API}/me/push`,
      headers: { authorization: `Bearer ${agenteToken}` },
      payload: {
        endpoint: 'https://push.exemplo.test/sub-1',
        keys: { p256dh: 'p1', auth: 'a1' },
      },
    });
    expect(agenteNegado.statusCode).toBe(403);

    const criada = await app.inject({
      method: 'POST',
      url: `${PREFIXO_API}/me/push`,
      headers: { authorization: `Bearer ${cidadaoToken}` },
      payload: {
        endpoint: 'https://push.exemplo.test/sub-1',
        keys: { p256dh: 'p1', auth: 'a1' },
      },
    });
    expect(criada.statusCode).toBe(201);

    // Mesmo navegador trocando de conta transfere a inscrição para a nova conta.
    const atualizada = await app.inject({
      method: 'POST',
      url: `${PREFIXO_API}/me/push`,
      headers: { authorization: `Bearer ${outroCidadaoToken}` },
      payload: {
        endpoint: 'https://push.exemplo.test/sub-1',
        keys: { p256dh: 'p2', auth: 'a2' },
      },
    });
    expect(atualizada.statusCode).toBe(201);
    const noBanco = await prisma.pushInscricao.findUniqueOrThrow({
      where: { endpoint: 'https://push.exemplo.test/sub-1' },
    });
    expect(noBanco.usuarioId).toBe(outroCidadaoId);
    expect(noBanco.p256dh).toBe('p2');

    // Remover por outra conta não apaga; remover pelo dono apaga.
    const outroRemove = await app.inject({
      method: 'DELETE',
      url: `${PREFIXO_API}/me/push`,
      headers: { authorization: `Bearer ${cidadaoToken}` },
      payload: { endpoint: 'https://push.exemplo.test/sub-1' },
    });
    expect(outroRemove.statusCode).toBe(204);
    expect(await prisma.pushInscricao.count()).toBe(1);

    const donoRemove = await app.inject({
      method: 'DELETE',
      url: `${PREFIXO_API}/me/push`,
      headers: { authorization: `Bearer ${outroCidadaoToken}` },
      payload: { endpoint: 'https://push.exemplo.test/sub-1' },
    });
    expect(donoRemove.statusCode).toBe(204);
    expect(await prisma.pushInscricao.count()).toBe(0);
  });

  it('resposta 410 do serviço de push apaga a inscrição no job da fila', async () => {
    const ocorrenciaId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, status)
      VALUES (${ocorrenciaId}::uuid, 'FA-2026-SOR-000901', ${cidadaoId}::uuid, ${categoriaId},
              ${SOROCABA.id}, ${orgaoId}, 'Poste sem luz na praça central',
              ST_SetSRID(ST_MakePoint(-47.4526::float8, -23.5015::float8), 4326)::geography,
              'EM_ANALISE'::status_ocorrencia)`;
    const evento = await prisma.ocorrenciaEvento.create({
      data: {
        ocorrenciaId,
        deStatus: 'RECEBIDA',
        paraStatus: 'EM_ANALISE',
        autorId: agenteId,
        orgaoId,
      },
    });
    await prisma.pushInscricao.create({
      data: {
        usuarioId: cidadaoId,
        endpoint: 'https://push.exemplo.test/expirada',
        p256dh: 'p1',
        auth: 'a1',
      },
    });
    enviarPush.mockResolvedValue('INSCRICAO_EXPIRADA');

    await app.get(FilaNotificacoes).eventoGravado({ eventoId: evento.id, ocorrenciaId });

    await vi.waitFor(
      async () => {
        expect(enviarPush).toHaveBeenCalledTimes(1);
        expect(await prisma.pushInscricao.count()).toBe(0);
      },
      { timeout: 10_000, interval: 50 },
    );
  });
});
