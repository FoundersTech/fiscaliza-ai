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
import type { StatusOcorrencia } from '../ocorrencias/domain/ocorrencia.js';
import { DestinatariosDoEvento } from './application/alertas.js';
import { FilaNotificacoes } from './application/fila-notificacoes.js';

/** O push não sai: os alertas da aba são lidos direto dos eventos. */
const notificacoes = { eventoGravado: vi.fn<FilaNotificacoes['eventoGravado']>() };

interface Alerta {
  evento_id: number;
  ocorrencia_id: string;
  protocolo: string;
  para_status_publico: string;
  reaberta: boolean;
  criado_em: string;
}

interface PaginaAlertas {
  itens: Alerta[];
  proximo_cursor: string | null;
}

interface Pessoa {
  id: string;
  token: string;
}

describe('Alertas', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let orgaoId: number;
  let sequencia = 0;
  let agente: Pessoa;
  let autora: Pessoa;
  let antes: Pessoa;
  let depois: Pessoa;
  let alheia: Pessoa;

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
    ({ orgaoId } = await aplicarCargaInicial(prisma));
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    agente = await criarPessoa(Papel.AGENTE_ORGAO);
    autora = await criarPessoa(Papel.CIDADAO);
    antes = await criarPessoa(Papel.CIDADAO);
    depois = await criarPessoa(Papel.CIDADAO);
    alheia = await criarPessoa(Papel.CIDADAO);
  });

  /** Conta já com a política aceita; o guard confere no banco, então ela precisa existir. */
  async function criarPessoa(papel: Papel): Promise<Pessoa> {
    const ehAgente = papel === Papel.AGENTE_ORGAO;
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId: ehAgente ? SOROCABA.id : null,
        orgaoId: ehAgente ? orgaoId : null,
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

  async function inserir(autorId = autora.id): Promise<{ id: string; protocolo: string }> {
    const id = randomUUID();
    sequencia += 1;
    const protocolo = `FA-2026-${SOROCABA.sigla}-${String(sequencia).padStart(6, '0')}`;
    const criadaEm = new Date(Date.now() - 60_000);
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em)
      VALUES (${id}::uuid, ${protocolo}, ${autorId}::uuid,
              (SELECT id FROM categoria WHERE slug = 'iluminacao'),
              ${SOROCABA.id}, ${orgaoId}, 'Poste apagado há uma semana na esquina',
              ST_SetSRID(ST_MakePoint(-47.4526, -23.5015), 4326)::geography,
              'Rua A, 1 · Centro', 'RECEBIDA', ${criadaEm})`;
    await prisma.ocorrenciaEvento.create({
      data: { ocorrenciaId: id, paraStatus: 'RECEBIDA', autorId, criadoEm: criadaEm },
    });
    return { id, protocolo };
  }

  function requisitar(method: 'GET' | 'POST', rota: string, token: string, corpo?: object) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      headers: { authorization: `Bearer ${token}` },
      ...(corpo ? { payload: corpo } : {}),
    });
  }

  async function confirmar(ocorrenciaId: string, pessoa: Pessoa): Promise<void> {
    const resposta = await requisitar(
      'POST',
      `ocorrencias/${ocorrenciaId}/confirmacoes`,
      pessoa.token,
    );
    expect(resposta.statusCode).toBe(201);
  }

  async function transicionar(
    ocorrenciaId: string,
    de: StatusOcorrencia,
    para: StatusOcorrencia,
    comentario?: string,
  ): Promise<void> {
    const resposta = await requisitar(
      'POST',
      `atendimento/ocorrencias/${ocorrenciaId}/transicoes`,
      agente.token,
      { status_esperado: de, para_status: para, ...(comentario ? { comentario } : {}) },
    );
    expect(resposta.statusCode).toBe(200);
  }

  async function alertas(pessoa: Pessoa, consulta = ''): Promise<PaginaAlertas> {
    const resposta = await requisitar('GET', `me/alertas${consulta}`, pessoa.token);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<PaginaAlertas>();
  }

  async function novos(pessoa: Pessoa): Promise<number> {
    const resposta = await requisitar('GET', 'me/alertas/novos', pessoa.token);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<{ quantidade: number }>().quantidade;
  }

  async function marcarVistos(pessoa: Pessoa): Promise<void> {
    const resposta = await requisitar('POST', 'me/alertas/vistos', pessoa.token);
    expect(resposta.statusCode).toBe(204);
  }

  function destinatarios(eventoId: number): Promise<string[]> {
    return app.get(DestinatariosDoEvento).executar(eventoId);
  }

  async function transicoesGravadas(ocorrenciaId: string): Promise<number[]> {
    const eventos = await prisma.ocorrenciaEvento.findMany({
      where: { ocorrenciaId, deStatus: { not: null } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return eventos.map((evento) => evento.id);
  }

  it('N transições geram N alertas para a autora e para quem confirmou antes de cada uma', async () => {
    const { id, protocolo } = await inserir();
    await confirmar(id, antes);

    await transicionar(id, 'RECEBIDA', 'EM_ANALISE');
    // Confirmou depois da primeira mudança: só recebe as seguintes.
    await confirmar(id, depois);
    await transicionar(id, 'EM_ANALISE', 'EM_EXECUCAO');
    await transicionar(id, 'EM_EXECUCAO', 'RESOLVIDA', 'Lâmpada trocada');
    const [primeira, segunda, terceira] = await transicoesGravadas(id);

    const daAutora = await alertas(autora);
    expect(daAutora.itens).toEqual([
      expect.objectContaining({
        evento_id: terceira,
        ocorrencia_id: id,
        protocolo,
        para_status_publico: 'RESOLVIDO',
        reaberta: false,
      }),
      expect.objectContaining({ evento_id: segunda, para_status_publico: 'EM_ANDAMENTO' }),
      expect.objectContaining({ evento_id: primeira, para_status_publico: 'EM_ANDAMENTO' }),
    ]);
    expect(Date.parse(daAutora.itens[0]!.criado_em)).not.toBeNaN();
    expect((await alertas(antes)).itens.map((alerta) => alerta.evento_id)).toEqual([
      terceira,
      segunda,
      primeira,
    ]);
    expect((await alertas(depois)).itens.map((alerta) => alerta.evento_id)).toEqual([
      terceira,
      segunda,
    ]);
    expect((await alertas(alheia)).itens).toEqual([]);

    // O push usa a mesma regra: nunca o agente, e quem confirmou depois fica fora da primeira.
    expect(await destinatarios(primeira!)).toEqual([autora.id, antes.id].sort());
    expect(await destinatarios(segunda!)).toEqual([autora.id, antes.id, depois.id].sort());
    expect(await destinatarios(terceira!)).not.toContain(agente.id);
  });

  it('o agente que fez a mudança não recebe alerta, nem mesmo se tiver confirmado', async () => {
    const { id } = await inserir();
    // Caso de borda: a confirmação do agente gravada direto no banco.
    await prisma.confirmacao.create({
      data: { ocorrenciaId: id, usuarioId: agente.id, criadaEm: new Date(Date.now() - 1_000) },
    });
    await transicionar(id, 'RECEBIDA', 'EM_ANALISE');
    const [evento] = await transicoesGravadas(id);

    expect(await destinatarios(evento!)).toEqual([autora.id]);
    const doAgente = await requisitar('GET', 'me/alertas', agente.token);
    expect(doAgente.statusCode).toBe(403);
  });

  it('o evento de criação não vira alerta', async () => {
    const { id } = await inserir();
    await confirmar(id, antes);
    const criacao = await prisma.ocorrenciaEvento.findFirstOrThrow({ where: { ocorrenciaId: id } });

    expect((await alertas(autora)).itens).toEqual([]);
    expect(await novos(autora)).toBe(0);
    expect(await destinatarios(criacao.id)).toEqual([]);
  });

  it('a reabertura pelo cidadão vira alerta para os outros, marcado como reaberta', async () => {
    const { id } = await inserir();
    await confirmar(id, antes);
    await confirmar(id, depois);
    await transicionar(id, 'RECEBIDA', 'EM_ANALISE');
    await transicionar(id, 'EM_ANALISE', 'EM_EXECUCAO');
    await transicionar(id, 'EM_EXECUCAO', 'RESOLVIDA', 'Lâmpada trocada');
    // A reabertura grava o evento de volta para em análise, feito por quem reabriu.
    await prisma.ocorrencia.update({ where: { id }, data: { status: 'EM_ANALISE' } });
    const reabertura = await prisma.ocorrenciaEvento.create({
      data: {
        ocorrenciaId: id,
        deStatus: 'RESOLVIDA',
        paraStatus: 'EM_ANALISE',
        autorId: antes.id,
        comentario: 'A lâmpada queimou de novo no dia seguinte',
        criadoEm: new Date(),
      },
    });

    const [maisRecente] = (await alertas(autora)).itens;
    expect(maisRecente).toMatchObject({
      evento_id: reabertura.id,
      para_status_publico: 'EM_ANDAMENTO',
      reaberta: true,
    });
    expect((await alertas(depois)).itens[0]!.evento_id).toBe(reabertura.id);
    // Quem reabriu não é avisado da própria reabertura.
    expect((await alertas(antes)).itens.map((alerta) => alerta.evento_id)).not.toContain(
      reabertura.id,
    );
    expect(await destinatarios(reabertura.id)).toEqual([autora.id, depois.id].sort());
  });

  it('recusa e duplicada chegam só para a autora', async () => {
    const { id } = await inserir();
    await confirmar(id, antes);
    await transicionar(id, 'RECEBIDA', 'RECUSADA', 'Fora da competência do órgão');

    expect((await alertas(autora)).itens).toEqual([
      expect.objectContaining({ ocorrencia_id: id, para_status_publico: 'RECUSADO' }),
    ]);
    expect((await alertas(antes)).itens).toEqual([]);
  });

  it('abrir a aba zera o indicador, e uma mudança nova volta a contar', async () => {
    const { id } = await inserir();
    await confirmar(id, antes);
    expect(await novos(antes)).toBe(0);

    await transicionar(id, 'RECEBIDA', 'EM_ANALISE');
    await transicionar(id, 'EM_ANALISE', 'EM_EXECUCAO');
    expect(await novos(antes)).toBe(2);
    expect(await novos(autora)).toBe(2);

    await marcarVistos(antes);
    expect(await novos(antes)).toBe(0);
    // A lista continua com os vistos; só o indicador zera, e só para quem abriu a aba.
    expect((await alertas(antes)).itens).toHaveLength(2);
    expect(await novos(autora)).toBe(2);

    await transicionar(id, 'EM_EXECUCAO', 'RESOLVIDA', 'Lâmpada trocada');
    expect(await novos(antes)).toBe(1);
  });

  it('pagina por cursor sem repetir nem pular', async () => {
    const primeira = await inserir();
    const segunda = await inserir();
    for (const { id } of [primeira, segunda]) {
      await transicionar(id, 'RECEBIDA', 'EM_ANALISE');
      await transicionar(id, 'EM_ANALISE', 'EM_EXECUCAO');
    }
    const todos = (await alertas(autora)).itens.map((alerta) => alerta.evento_id);
    expect(todos).toHaveLength(4);

    const pagina1 = await alertas(autora, '?limite=3');
    const pagina2 = await alertas(autora, `?limite=3&cursor=${pagina1.proximo_cursor}`);
    expect(pagina2.proximo_cursor).toBeNull();
    expect([...pagina1.itens, ...pagina2.itens].map((alerta) => alerta.evento_id)).toEqual(todos);

    const invalido = await requisitar('GET', 'me/alertas?cursor=abc', autora.token);
    expect(invalido.statusCode).toBe(422);
    expect(invalido.json<{ codigo: string }>().codigo).toBe('VALIDACAO');
  });

  it('sem token, 401', async () => {
    const resposta = await app.inject({ method: 'GET', url: `/${PREFIXO_API}/me/alertas/novos` });
    expect(resposta.statusCode).toBe(401);
  });
});
