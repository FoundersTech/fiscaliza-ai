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
import { FilaNotificacoes } from '../notificacoes/application/fila-notificacoes.js';
import type { StatusOcorrencia } from './domain/ocorrencia.js';

/** Os avisos não saem: os testes conferem o que foi enfileirado. */
const notificacoes = { eventoGravado: vi.fn<FilaNotificacoes['eventoGravado']>() };

const UM_DIA = 24 * 60 * 60 * 1000;
const CINCO_MINUTOS = 5 * 60 * 1000;

interface Erro {
  codigo: string;
  mensagem: string;
  detalhes: Record<string, unknown>;
}

interface Pessoa {
  id: string;
  token: string;
}

describe('Avaliação e reabertura depois da resolução', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let orgao: number;
  let sequencia = 0;
  let autor: Pessoa;
  let vizinha: Pessoa;
  let outroVizinho: Pessoa;
  let estranho: Pessoa;
  let agente: Pessoa;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FilaNotificacoes)
      .useValue(notificacoes)
      .compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    redis = app.get<Redis>(REDIS);

    ({ orgaoId: orgao } = await aplicarCargaInicial(prisma));
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    autor = await criarUsuario(Papel.CIDADAO);
    vizinha = await criarUsuario(Papel.CIDADAO);
    outroVizinho = await criarUsuario(Papel.CIDADAO);
    estranho = await criarUsuario(Papel.CIDADAO);
    agente = await criarUsuario(Papel.AGENTE_ORGAO);
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    vi.clearAllMocks();
  });

  /** Conta já com a política aceita; o guard confere no banco, então ela precisa existir. */
  async function criarUsuario(papel: Papel): Promise<Pessoa> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId: papel === Papel.CIDADAO ? null : SOROCABA.id,
        orgaoId: papel === Papel.AGENTE_ORGAO ? orgao : null,
        politicaVersao: '1',
      },
    });
    const token = await app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
      usuarioId: usuario.id,
      papel,
      municipioId: usuario.municipioId,
      orgaoId: usuario.orgaoId,
    });
    return { id: usuario.id, token };
  }

  /** Ocorrência do autor, resolvida há `resolvidaHaMs`, com as confirmações dadas na criação. */
  async function resolvida(
    resolvidaHaMs = 3 * UM_DIA,
    {
      status = 'RESOLVIDA',
      confirmadaPor = [],
    }: { status?: StatusOcorrencia; confirmadaPor?: Pessoa[] } = {},
  ): Promise<string> {
    const id = randomUUID();
    sequencia += 1;
    const resolvidaEm = new Date(Date.now() - resolvidaHaMs);
    const criadaEm = new Date(resolvidaEm.getTime() - 5 * UM_DIA);
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em, triada_em,
                              resolvida_em)
      VALUES (${id}::uuid, ${`FA-2026-SOR-${String(sequencia).padStart(6, '0')}`},
              ${autor.id}::uuid, (SELECT id FROM categoria WHERE slug = 'iluminacao'),
              ${SOROCABA.id}, ${orgao}, 'Poste apagado há uma semana na esquina',
              ST_SetSRID(ST_MakePoint(-47.4526, -23.5015), 4326)::geography,
              'Rua A, 1 · Centro', ${status}::status_ocorrencia, ${criadaEm}, ${criadaEm},
              ${status === 'RESOLVIDA' ? resolvidaEm : null})`;
    await prisma.ocorrenciaEvento.create({
      data: { ocorrenciaId: id, paraStatus: 'RECEBIDA', autorId: autor.id, criadoEm: criadaEm },
    });
    for (const pessoa of confirmadaPor) {
      await prisma.confirmacao.create({
        data: { ocorrenciaId: id, usuarioId: pessoa.id, criadaEm: criadaEm },
      });
    }
    return id;
  }

  function post(rota: string, pessoa: Pessoa, corpo: object) {
    return app.inject({
      method: 'POST',
      url: `/${PREFIXO_API}/${rota}`,
      headers: { authorization: `Bearer ${pessoa.token}` },
      payload: corpo,
    });
  }

  const avaliar = (id: string, pessoa: Pessoa, corpo: object = { nota: 4 }) =>
    post(`ocorrencias/${id}/avaliacoes`, pessoa, corpo);

  const reabrir = (
    id: string,
    pessoa: Pessoa,
    corpo: object = { justificativa: 'O poste continua apagado.' },
  ) => post(`ocorrencias/${id}/reabertura`, pessoa, corpo);

  async function detalhe(id: string, pessoa: Pessoa) {
    const resposta = await app.inject({
      method: 'GET',
      url: `/${PREFIXO_API}/ocorrencias/${id}`,
      headers: { authorization: `Bearer ${pessoa.token}` },
    });
    expect(resposta.statusCode).toBe(200);
    return resposta.json<{ pode_avaliar: boolean; pode_reabrir: boolean }>();
  }

  describe('POST /ocorrencias/:id/avaliacoes', () => {
    it('o autor avalia com nota e comentário, e o botão some do detalhe', async () => {
      const id = await resolvida();

      const resposta = await avaliar(id, autor, { nota: 5, comentario: '  Trocaram a lâmpada. ' });

      expect(resposta.statusCode).toBe(201);
      expect(resposta.json()).toEqual({ nota: 5, comentario: 'Trocaram a lâmpada.' });
      expect(await prisma.avaliacao.findMany({ where: { ocorrenciaId: id } })).toMatchObject([
        { usuarioId: autor.id, nota: 5, comentario: 'Trocaram a lâmpada.' },
      ]);
      expect(await detalhe(id, autor)).toMatchObject({ pode_avaliar: false, pode_reabrir: true });
    });

    it('no 10º dia a avaliação é aceita, e no 11º dá 422 FORA_DO_PRAZO', async () => {
      const decimoDia = await resolvida(10 * UM_DIA - CINCO_MINUTOS);
      expect((await avaliar(decimoDia, autor)).statusCode).toBe(201);

      const decimoPrimeiroDia = await resolvida(10 * UM_DIA + CINCO_MINUTOS);
      const resposta = await avaliar(decimoPrimeiroDia, autor);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<Erro>().codigo).toBe('FORA_DO_PRAZO');
      expect(await prisma.avaliacao.count({ where: { ocorrenciaId: decimoPrimeiroDia } })).toBe(0);
    });

    it('quem confirmou também avalia; quem não tem vínculo recebe 403 SEM_VINCULO', async () => {
      const id = await resolvida(UM_DIA, { confirmadaPor: [vizinha] });

      expect((await avaliar(id, vizinha)).statusCode).toBe(201);
      const resposta = await avaliar(id, estranho);
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json<Erro>().codigo).toBe('SEM_VINCULO');
      expect(await prisma.avaliacao.count({ where: { ocorrenciaId: id } })).toBe(1);
    });

    it('a segunda avaliação da mesma pessoa dá 409 JA_AVALIADA e não muda a primeira', async () => {
      const id = await resolvida();
      await avaliar(id, autor, { nota: 2 });

      const segunda = await avaliar(id, autor, { nota: 5 });

      expect(segunda.statusCode).toBe(409);
      expect(segunda.json<Erro>().codigo).toBe('JA_AVALIADA');
      expect(await prisma.avaliacao.findMany({ where: { ocorrenciaId: id } })).toMatchObject([
        { nota: 2 },
      ]);
    });

    it('ocorrência ainda aberta dá 422 NAO_RESOLVIDA', async () => {
      const id = await resolvida(0, { status: 'EM_EXECUCAO' });
      const resposta = await avaliar(id, autor);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<Erro>().codigo).toBe('NAO_RESOLVIDA');
    });

    it('nota fora de 1 a 5 ou comentário longo dá 422 VALIDACAO; agente recebe 403', async () => {
      const id = await resolvida();
      for (const corpo of [
        { nota: 0 },
        { nota: 6 },
        { nota: 3.5 },
        { nota: 3, comentario: 'x'.repeat(501) },
      ]) {
        const resposta = await avaliar(id, autor, corpo);
        expect(resposta.statusCode).toBe(422);
        expect(resposta.json<Erro>().codigo).toBe('VALIDACAO');
      }
      expect((await avaliar(id, agente)).statusCode).toBe(403);
      expect(await prisma.avaliacao.count()).toBe(0);
    });
  });

  describe('POST /ocorrencias/:id/reabertura', () => {
    it('volta para a fila do agente como reaberta, grava o evento e enfileira o aviso', async () => {
      const id = await resolvida(UM_DIA, { confirmadaPor: [vizinha, outroVizinho] });

      const resposta = await reabrir(id, vizinha, { justificativa: '  A luz apagou de novo.  ' });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json()).toEqual({ status: 'EM_ANALISE', reaberturas: 1 });
      expect(
        await prisma.ocorrencia.findUniqueOrThrow({
          where: { id },
          select: { status: true, resolvidaEm: true, reaberturas: true },
        }),
      ).toEqual({ status: 'EM_ANALISE', resolvidaEm: null, reaberturas: 1 });

      const [evento] = await prisma.ocorrenciaEvento.findMany({
        where: { ocorrenciaId: id, deStatus: { not: null } },
      });
      expect(evento).toMatchObject({
        deStatus: 'RESOLVIDA',
        paraStatus: 'EM_ANALISE',
        autorId: vizinha.id,
        orgaoId: null,
        comentario: 'A luz apagou de novo.',
      });
      expect(notificacoes.eventoGravado).toHaveBeenCalledWith({
        eventoId: evento!.id,
        ocorrenciaId: id,
      });

      const fila = await app.inject({
        method: 'GET',
        url: `/${PREFIXO_API}/atendimento/ocorrencias?status=EM_ANALISE`,
        headers: { authorization: `Bearer ${agente.token}` },
      });
      expect(fila.json<{ itens: { id: string; reaberta: boolean }[] }>().itens).toEqual([
        expect.objectContaining({ id, reaberta: true }),
      ]);
    });

    it('o evento gravado leva o autor e quem confirmou como destinatários do aviso', async () => {
      const id = await resolvida(UM_DIA, { confirmadaPor: [vizinha, outroVizinho] });
      await reabrir(id, vizinha);

      // Mesma regra dos alertas: autor ou quem confirmou até o evento, menos quem o gerou.
      const destinatarios = await prisma.$queryRaw<{ usuario_id: string }[]>`
        SELECT DISTINCT u.usuario_id
        FROM ocorrencia_evento e
        JOIN ocorrencia o ON o.id = e.ocorrencia_id
        CROSS JOIN LATERAL (
          SELECT o.autor_id AS usuario_id
          UNION
          SELECT c.usuario_id FROM confirmacao c
           WHERE c.ocorrencia_id = o.id AND c.criada_em <= e.criado_em
        ) u
        WHERE e.ocorrencia_id = ${id}::uuid AND e.de_status IS NOT NULL
          AND u.usuario_id IS DISTINCT FROM e.autor_id`;
      expect(destinatarios.map((linha) => linha.usuario_id).sort()).toEqual(
        [autor.id, outroVizinho.id].sort(),
      );
    });

    it('no 10º dia a reabertura é aceita, e no 11º dá 422 FORA_DO_PRAZO', async () => {
      const decimoDia = await resolvida(10 * UM_DIA - CINCO_MINUTOS);
      expect((await reabrir(decimoDia, autor)).statusCode).toBe(200);

      const decimoPrimeiroDia = await resolvida(10 * UM_DIA + CINCO_MINUTOS);
      const resposta = await reabrir(decimoPrimeiroDia, autor);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<Erro>().codigo).toBe('FORA_DO_PRAZO');
      expect(
        (await prisma.ocorrencia.findUniqueOrThrow({ where: { id: decimoPrimeiroDia } })).status,
      ).toBe('RESOLVIDA');
      expect(notificacoes.eventoGravado).toHaveBeenCalledTimes(1);
    });

    it('quem não é autor nem confirmou recebe 403 SEM_VINCULO, e nada muda', async () => {
      const id = await resolvida();
      const resposta = await reabrir(id, estranho);
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json<Erro>().codigo).toBe('SEM_VINCULO');
      expect((await prisma.ocorrencia.findUniqueOrThrow({ where: { id } })).status).toBe(
        'RESOLVIDA',
      );
      expect(notificacoes.eventoGravado).not.toHaveBeenCalled();
    });

    it('uma ocorrência já reaberta não reabre de novo: 422 NAO_RESOLVIDA', async () => {
      const id = await resolvida();
      await reabrir(id, autor);
      const segunda = await reabrir(id, autor);
      expect(segunda.statusCode).toBe(422);
      expect(segunda.json<Erro>().codigo).toBe('NAO_RESOLVIDA');

      const recusada = await resolvida(0, { status: 'RECUSADA' });
      expect((await reabrir(recusada, autor)).json<Erro>().codigo).toBe('NAO_RESOLVIDA');
    });

    it('justificativa com menos de 10 caracteres dá 422 VALIDACAO', async () => {
      const id = await resolvida();
      const resposta = await reabrir(id, autor, { justificativa: '  curta   ' });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<Erro>().codigo).toBe('VALIDACAO');
    });

    it('reaberta e resolvida de novo, a avaliação feita antes continua valendo', async () => {
      const id = await resolvida();
      expect((await avaliar(id, autor)).statusCode).toBe(201);
      await reabrir(id, autor);
      await prisma.ocorrencia.update({
        where: { id },
        data: { status: 'RESOLVIDA', resolvidaEm: new Date() },
      });

      expect((await avaliar(id, autor)).statusCode).toBe(409);
      expect((await reabrir(id, autor)).json()).toEqual({ status: 'EM_ANALISE', reaberturas: 2 });
    });
  });
});
