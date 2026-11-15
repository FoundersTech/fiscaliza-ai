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

/** Outro município, longe de Sorocaba, com o seu próprio órgão. */
const OUTRO = { id: 3523909, nome: 'Itu', uf: 'SP', sigla: 'ITU' } as const;

interface ItemFila {
  id: string;
  protocolo: string;
  status: StatusOcorrencia;
  status_publico: string;
  reaberta: boolean;
  miniatura_url: string | null;
  foto_em_analise: boolean;
}

interface Fila {
  itens: ItemFila[];
  proximo_cursor: string | null;
}

interface Evento {
  de_status: StatusOcorrencia | null;
  para_status: StatusOcorrencia;
  orgao: string | null;
  comentario: string | null;
  criado_em: string;
}

interface DetalheAtendimento {
  id: string;
  status: StatusOcorrencia;
  reaberta: boolean;
  fotos: { url: string; miniatura_url: string | null }[];
  eventos: Evento[];
  transicoes_permitidas: StatusOcorrencia[];
}

interface Erro {
  codigo: string;
  mensagem: string;
  detalhes: Record<string, unknown>;
}

interface NovaOcorrencia {
  status?: StatusOcorrencia;
  criadaEm?: Date;
  reaberturas?: number;
  categoria?: string;
  municipio?: number;
}

type Moderacao = 'PENDENTE' | 'APROVADA' | 'REJEITADA';

describe('Atendimento pelo órgão', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let redis: Redis;
  let orgaoSorocaba: number;
  let orgaoOutro: number;
  let sequencia = 0;
  const tokens = { agente: '', colega: '', agenteOutro: '', cidadao: '' };
  const ids = { agente: '', cidadao: '' };

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

    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    ({ token: tokens.agente, id: ids.agente } = await criarUsuario(Papel.AGENTE_ORGAO));
    ({ token: tokens.colega } = await criarUsuario(Papel.AGENTE_ORGAO));
    ({ token: tokens.agenteOutro } = await criarUsuario(Papel.AGENTE_ORGAO, OUTRO.id));
    ({ token: tokens.cidadao, id: ids.cidadao } = await criarUsuario(Papel.CIDADAO));
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    await prisma.$executeRaw`TRUNCATE usuario RESTART IDENTITY CASCADE`;
    await prisma.orgao.deleteMany({ where: { municipioId: OUTRO.id } });
    await prisma.municipio.deleteMany({ where: { id: OUTRO.id } });
    await app.close();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, protocolo_sequencia CASCADE`;
    const chaves = await redis.keys('limite:*');
    if (chaves.length) await redis.del(...chaves);
    vi.clearAllMocks();
  });

  /** Conta já com a política aceita; o guard confere no banco, então ela precisa existir. */
  async function criarUsuario(
    papel: Papel,
    municipioId: number = SOROCABA.id,
  ): Promise<{ token: string; id: string }> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId: papel === Papel.CIDADAO ? null : municipioId,
        orgaoId:
          papel === Papel.AGENTE_ORGAO
            ? municipioId === OUTRO.id
              ? orgaoOutro
              : orgaoSorocaba
            : null,
        politicaVersao: '1',
      },
    });
    const token = await app.get<EmissorToken>(EMISSOR_TOKEN).emitir({
      usuarioId: usuario.id,
      papel,
      municipioId: usuario.municipioId,
      orgaoId: usuario.orgaoId,
    });
    return { token, id: usuario.id };
  }

  async function inserir(nova: NovaOcorrencia = {}): Promise<{ id: string; protocolo: string }> {
    const id = randomUUID();
    sequencia += 1;
    const municipio = nova.municipio ?? SOROCABA.id;
    const sigla = municipio === OUTRO.id ? OUTRO.sigla : SOROCABA.sigla;
    const protocolo = `FA-2026-${sigla}-${String(sequencia).padStart(6, '0')}`;
    const criadaEm = nova.criadaEm ?? new Date();
    const orgao = municipio === OUTRO.id ? orgaoOutro : orgaoSorocaba;
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, reaberturas, criada_em)
      VALUES (${id}::uuid, ${protocolo}, ${ids.cidadao}::uuid,
              (SELECT id FROM categoria WHERE slug = ${nova.categoria ?? 'iluminacao'}),
              ${municipio}, ${orgao}, 'Poste apagado há uma semana na esquina',
              ST_SetSRID(ST_MakePoint(-47.4526, -23.5015), 4326)::geography,
              'Rua A, 1 · Centro', ${nova.status ?? 'RECEBIDA'}::status_ocorrencia,
              ${nova.reaberturas ?? 0}, ${criadaEm})`;
    await prisma.ocorrenciaEvento.create({
      data: { ocorrenciaId: id, paraStatus: 'RECEBIDA', autorId: ids.cidadao, criadoEm: criadaEm },
    });
    return { id, protocolo };
  }

  async function foto(ocorrenciaId: string, ordem: number, moderacao: Moderacao): Promise<void> {
    const aprovada = moderacao === 'APROVADA';
    await prisma.ocorrenciaFoto.create({
      data: {
        ocorrenciaId,
        ordem,
        moderacao,
        storageKey: aprovada ? `ocorrencias/${ocorrenciaId}/${ordem}.jpg` : null,
        miniaturaKey: aprovada ? `ocorrencias/${ocorrenciaId}/${ordem}-400.jpg` : null,
        uploadKey: aprovada ? null : `ocorrencias/${ocorrenciaId}/${ordem}-original.jpg`,
      },
    });
  }

  function requisitar(method: 'GET' | 'POST', rota: string, token: string, corpo?: object) {
    return app.inject({
      method,
      url: `/${PREFIXO_API}/${rota}`,
      headers: { authorization: `Bearer ${token}` },
      ...(corpo ? { payload: corpo } : {}),
    });
  }

  function transicionar(
    id: string,
    corpo: {
      status_esperado: StatusOcorrencia;
      para_status: StatusOcorrencia;
      comentario?: string;
      protocolo_original?: string;
    },
    token = tokens.agente,
  ) {
    return requisitar('POST', `atendimento/ocorrencias/${id}/transicoes`, token, corpo);
  }

  async function fila(consulta = '', token = tokens.agente): Promise<Fila> {
    const resposta = await requisitar('GET', `atendimento/ocorrencias${consulta}`, token);
    expect(resposta.statusCode).toBe(200);
    return resposta.json<Fila>();
  }

  function noBanco(id: string) {
    return prisma.ocorrencia.findUniqueOrThrow({
      where: { id },
      select: { status: true, triadaEm: true, resolvidaEm: true, duplicadaDeId: true },
    });
  }

  function transicoesGravadas(id: string) {
    return prisma.ocorrenciaEvento.findMany({
      where: { ocorrenciaId: id, deStatus: { not: null } },
      orderBy: { id: 'asc' },
    });
  }

  describe('GET /atendimento/ocorrencias', () => {
    it('lista só as do órgão do agente, da mais antiga para a mais recente', async () => {
      const agora = Date.now();
      const nova = await inserir({ criadaEm: new Date(agora - 1_000) });
      const antiga = await inserir({ criadaEm: new Date(agora - 3 * 86_400_000) });
      const meio = await inserir({ criadaEm: new Date(agora - 86_400_000), status: 'RECUSADA' });
      const deItu = await inserir({ municipio: OUTRO.id });

      const { itens } = await fila();
      expect(itens.map((item) => item.id)).toEqual([antiga.id, meio.id, nova.id]);
      expect(itens[1]!.status).toBe('RECUSADA');

      const doOutro = await fila('', tokens.agenteOutro);
      expect(doOutro.itens.map((item) => item.id)).toEqual([deItu.id]);
    });

    it('marca as reabertas com reaberta', async () => {
      const reaberta = await inserir({ status: 'EM_ANALISE', reaberturas: 1 });
      const comum = await inserir({ status: 'EM_ANALISE' });

      const { itens } = await fila();
      const porId = new Map(itens.map((item) => [item.id, item.reaberta]));
      expect(porId.get(reaberta.id)).toBe(true);
      expect(porId.get(comum.id)).toBe(false);
    });

    it('filtra por status e por categoria', async () => {
      const recebida = await inserir();
      const emAnalise = await inserir({ status: 'EM_ANALISE' });
      const buraco = await inserir({ categoria: 'pavimentacao' });

      const porStatus = await fila('?status=EM_ANALISE');
      expect(porStatus.itens.map((item) => item.id)).toEqual([emAnalise.id]);

      const porCategoria = await fila('?categoria=pavimentacao');
      expect(porCategoria.itens.map((item) => item.id)).toEqual([buraco.id]);

      const combinados = await fila('?status=RECEBIDA&categoria=iluminacao');
      expect(combinados.itens.map((item) => item.id)).toEqual([recebida.id]);

      const invalido = await requisitar(
        'GET',
        'atendimento/ocorrencias?status=RECEBIDO',
        tokens.agente,
      );
      expect(invalido.statusCode).toBe(422);
    });

    it('pagina por cursor sem repetir nem pular', async () => {
      const agora = Date.now();
      const criadas = [];
      for (let i = 5; i > 0; i -= 1) {
        criadas.push(await inserir({ criadaEm: new Date(agora - i * 60_000) }));
      }

      const primeira = await fila('?limite=2');
      const segunda = await fila(`?limite=2&cursor=${primeira.proximo_cursor}`);
      const terceira = await fila(`?limite=2&cursor=${segunda.proximo_cursor}`);
      expect(terceira.proximo_cursor).toBeNull();
      expect(
        [...primeira.itens, ...segunda.itens, ...terceira.itens].map((item) => item.id),
      ).toEqual(criadas.map((criada) => criada.id));
    });

    it('foto PENDENTE ou REJEITADA não aparece na fila', async () => {
      const pendente = await inserir();
      await foto(pendente.id, 1, 'PENDENTE');
      const mista = await inserir();
      await foto(mista.id, 1, 'REJEITADA');
      await foto(mista.id, 2, 'APROVADA');

      const { itens } = await fila();
      const itemPendente = itens.find((item) => item.id === pendente.id)!;
      expect(itemPendente.miniatura_url).toBeNull();
      expect(itemPendente.foto_em_analise).toBe(true);
      const itemMisto = itens.find((item) => item.id === mista.id)!;
      expect(itemMisto.miniatura_url).toMatch(/\/2-400\.jpg$/);
    });

    it('só o agente do órgão acessa', async () => {
      const resposta = await requisitar('GET', 'atendimento/ocorrencias', tokens.cidadao);
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json<Erro>().codigo).toBe('ACESSO_NEGADO');
    });
  });

  describe('GET /atendimento/ocorrencias/:id', () => {
    it('devolve o status interno, todos os eventos, as ações possíveis e só as fotos aprovadas', async () => {
      const { id } = await inserir({ status: 'EM_ANALISE', reaberturas: 1 });
      await foto(id, 1, 'PENDENTE');
      await foto(id, 2, 'APROVADA');
      await prisma.ocorrenciaEvento.create({
        data: {
          ocorrenciaId: id,
          deStatus: 'RECEBIDA',
          paraStatus: 'EM_ANALISE',
          autorId: ids.agente,
          orgaoId: orgaoSorocaba,
          comentario: 'Equipe a caminho',
        },
      });

      const resposta = await requisitar('GET', `atendimento/ocorrencias/${id}`, tokens.agente);
      expect(resposta.statusCode).toBe(200);
      const detalhe = resposta.json<DetalheAtendimento>();
      expect(detalhe.status).toBe('EM_ANALISE');
      expect(detalhe.reaberta).toBe(true);
      expect(detalhe.transicoes_permitidas).toEqual(['EM_EXECUCAO', 'RECUSADA', 'DUPLICADA']);
      expect(detalhe.fotos).toHaveLength(1);
      expect(detalhe.fotos[0]!.url).toMatch(/\/2\.jpg$/);
      expect(detalhe.eventos.map((evento) => [evento.de_status, evento.para_status])).toEqual([
        [null, 'RECEBIDA'],
        ['RECEBIDA', 'EM_ANALISE'],
      ]);
      expect(detalhe.eventos[1]).toMatchObject({
        orgao: 'Prefeitura de Sorocaba',
        comentario: 'Equipe a caminho',
      });
      // Quem mudou o status não sai na resposta.
      expect(JSON.stringify(detalhe)).not.toContain(ids.agente);
    });

    it('mostra também recusadas e duplicadas do órgão', async () => {
      const { id } = await inserir({ status: 'RECUSADA' });
      const resposta = await requisitar('GET', `atendimento/ocorrencias/${id}`, tokens.agente);
      expect(resposta.statusCode).toBe(200);
      expect(resposta.json<DetalheAtendimento>().transicoes_permitidas).toEqual([]);
    });

    it('agente de outro órgão recebe 403 OUTRO_ORGAO; id inexistente, 404', async () => {
      const { id } = await inserir();
      const deOutro = await requisitar('GET', `atendimento/ocorrencias/${id}`, tokens.agenteOutro);
      expect(deOutro.statusCode).toBe(403);
      expect(deOutro.json<Erro>().codigo).toBe('OUTRO_ORGAO');

      const inexistente = await requisitar(
        'GET',
        `atendimento/ocorrencias/${randomUUID()}`,
        tokens.agente,
      );
      expect(inexistente.statusCode).toBe(404);
      expect(inexistente.json<Erro>().codigo).toBe('NAO_ENCONTRADA');
    });
  });

  describe('POST /atendimento/ocorrencias/:id/transicoes', () => {
    const permitidas: [StatusOcorrencia, StatusOcorrencia][] = [
      ['RECEBIDA', 'EM_ANALISE'],
      ['RECEBIDA', 'RECUSADA'],
      ['RECEBIDA', 'DUPLICADA'],
      ['EM_ANALISE', 'EM_EXECUCAO'],
      ['EM_ANALISE', 'RECUSADA'],
      ['EM_ANALISE', 'DUPLICADA'],
      ['EM_EXECUCAO', 'RESOLVIDA'],
    ];

    it.each(permitidas)('%s → %s funciona e grava o evento', async (de, para) => {
      const original = await inserir({ status: 'EM_ANALISE' });
      const { id } = await inserir({ status: de });

      const resposta = await transicionar(id, {
        status_esperado: de,
        para_status: para,
        comentario: 'Comentário do órgão',
        ...(para === 'DUPLICADA' ? { protocolo_original: original.protocolo } : {}),
      });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json<{ status: string }>().status).toBe(para);
      const gravada = await noBanco(id);
      expect(gravada.status).toBe(para);
      expect(gravada.triadaEm !== null).toBe(de === 'RECEBIDA');
      expect(gravada.resolvidaEm !== null).toBe(para === 'RESOLVIDA');
      expect(gravada.duplicadaDeId).toBe(para === 'DUPLICADA' ? original.id : null);

      const [evento, ...outros] = await transicoesGravadas(id);
      expect(outros).toHaveLength(0);
      expect(evento).toMatchObject({
        deStatus: de,
        paraStatus: para,
        autorId: ids.agente,
        orgaoId: orgaoSorocaba,
        comentario: 'Comentário do órgão',
      });
      expect(notificacoes.eventoGravado).toHaveBeenCalledExactlyOnceWith({
        eventoId: evento!.id,
        ocorrenciaId: id,
      });
    });

    it('leva de RECEBIDA a RESOLVIDA; triada_em fica na primeira saída de RECEBIDA', async () => {
      const { id } = await inserir();
      const passos: [StatusOcorrencia, StatusOcorrencia, string?][] = [
        ['RECEBIDA', 'EM_ANALISE'],
        ['EM_ANALISE', 'EM_EXECUCAO'],
        ['EM_EXECUCAO', 'RESOLVIDA', 'Lâmpada trocada'],
      ];
      let triadaEm: Date | null = null;
      for (const [de, para, comentario] of passos) {
        const resposta = await transicionar(id, {
          status_esperado: de,
          para_status: para,
          ...(comentario ? { comentario } : {}),
        });
        expect(resposta.statusCode).toBe(200);
        triadaEm ??= (await noBanco(id)).triadaEm;
      }

      const final = await noBanco(id);
      expect(final.status).toBe('RESOLVIDA');
      expect(final.triadaEm).toEqual(triadaEm);
      expect(final.resolvidaEm!.getTime()).toBeGreaterThanOrEqual(final.triadaEm!.getTime());
      expect(await transicoesGravadas(id)).toHaveLength(3);
      expect(notificacoes.eventoGravado).toHaveBeenCalledTimes(3);
    });

    it('transição fora das permitidas dá 422 TRANSICAO_INVALIDA e nada muda', async () => {
      const casos: [StatusOcorrencia, StatusOcorrencia][] = [
        ['RECEBIDA', 'RESOLVIDA'],
        ['RECEBIDA', 'EM_EXECUCAO'],
        ['EM_EXECUCAO', 'RECUSADA'],
        ['RESOLVIDA', 'EM_ANALISE'],
        ['RECUSADA', 'EM_ANALISE'],
        ['DUPLICADA', 'RECEBIDA'],
      ];
      for (const [de, para] of casos) {
        const { id } = await inserir({ status: de });
        const resposta = await transicionar(id, {
          status_esperado: de,
          para_status: para,
          comentario: 'Qualquer coisa',
        });
        expect(resposta.statusCode, `${de} → ${para}`).toBe(422);
        expect(resposta.json<Erro>().codigo).toBe('TRANSICAO_INVALIDA');
        expect((await noBanco(id)).status).toBe(de);
        expect(await transicoesGravadas(id)).toHaveLength(0);
      }
      expect(notificacoes.eventoGravado).not.toHaveBeenCalled();
    });

    it('RESOLVIDA sem comentário dá 422 COMENTARIO_OBRIGATORIO', async () => {
      const { id } = await inserir({ status: 'EM_EXECUCAO' });
      for (const comentario of [undefined, '   ']) {
        const resposta = await transicionar(id, {
          status_esperado: 'EM_EXECUCAO',
          para_status: 'RESOLVIDA',
          ...(comentario === undefined ? {} : { comentario }),
        });
        expect(resposta.statusCode).toBe(422);
        expect(resposta.json<Erro>().codigo).toBe('COMENTARIO_OBRIGATORIO');
      }
      const gravada = await noBanco(id);
      expect(gravada.status).toBe('EM_EXECUCAO');
      expect(gravada.resolvidaEm).toBeNull();
      expect(await transicoesGravadas(id)).toHaveLength(0);
    });

    it('RECUSADA sem justificativa dá 422 COMENTARIO_OBRIGATORIO', async () => {
      const { id } = await inserir();
      const resposta = await transicionar(id, {
        status_esperado: 'RECEBIDA',
        para_status: 'RECUSADA',
      });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json<Erro>().codigo).toBe('COMENTARIO_OBRIGATORIO');
      expect((await noBanco(id)).triadaEm).toBeNull();
    });

    it('DUPLICADA exige protocolo de uma original válida do mesmo município', async () => {
      const { id, protocolo } = await inserir();
      const outraDuplicada = await inserir({ status: 'DUPLICADA' });
      const deItu = await inserir({ municipio: OUTRO.id });

      for (const protocoloOriginal of [
        undefined,
        'FA-2026-SOR-999999',
        protocolo,
        outraDuplicada.protocolo,
        deItu.protocolo,
      ]) {
        const resposta = await transicionar(id, {
          status_esperado: 'RECEBIDA',
          para_status: 'DUPLICADA',
          ...(protocoloOriginal ? { protocolo_original: protocoloOriginal } : {}),
        });
        expect(resposta.statusCode, String(protocoloOriginal)).toBe(422);
        expect(resposta.json<Erro>().codigo).toBe('ORIGINAL_INVALIDA');
      }
      const gravada = await noBanco(id);
      expect(gravada).toMatchObject({ status: 'RECEBIDA', duplicadaDeId: null, triadaEm: null });
      expect(await transicoesGravadas(id)).toHaveLength(0);
    });

    it('dois POSTs com o mesmo status_esperado: um 200 e um 409 CONFLITO_STATUS', async () => {
      const { id } = await inserir();
      const respostas = await Promise.all([
        transicionar(id, { status_esperado: 'RECEBIDA', para_status: 'EM_ANALISE' }),
        transicionar(
          id,
          { status_esperado: 'RECEBIDA', para_status: 'RECUSADA', comentario: 'Fora do escopo' },
          tokens.colega,
        ),
      ]);

      expect(respostas.map((resposta) => resposta.statusCode).sort()).toEqual([200, 409]);
      const conflito = respostas.find((resposta) => resposta.statusCode === 409)!;
      expect(conflito.json<Erro>().codigo).toBe('CONFLITO_STATUS');
      const vencedora = respostas.find((resposta) => resposta.statusCode === 200)!;
      const status = vencedora.json<{ status: StatusOcorrencia }>().status;
      expect((await noBanco(id)).status).toBe(status);
      expect(conflito.json<Erro>().detalhes).toEqual({ status_atual: status });
      expect(await transicoesGravadas(id)).toHaveLength(1);
      expect(notificacoes.eventoGravado).toHaveBeenCalledTimes(1);
    });

    it('status_esperado desatualizado dá 409 sem mudar nada', async () => {
      const { id } = await inserir({ status: 'EM_ANALISE' });
      const resposta = await transicionar(id, {
        status_esperado: 'RECEBIDA',
        para_status: 'EM_ANALISE',
      });
      expect(resposta.statusCode).toBe(409);
      expect(resposta.json<Erro>()).toMatchObject({
        codigo: 'CONFLITO_STATUS',
        detalhes: { status_atual: 'EM_ANALISE' },
      });
      expect(await transicoesGravadas(id)).toHaveLength(0);
    });

    it('agente de outro órgão recebe 403 OUTRO_ORGAO e nada muda', async () => {
      const { id } = await inserir();
      const resposta = await transicionar(
        id,
        { status_esperado: 'RECEBIDA', para_status: 'EM_ANALISE' },
        tokens.agenteOutro,
      );
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json<Erro>().codigo).toBe('OUTRO_ORGAO');
      expect(await noBanco(id)).toMatchObject({ status: 'RECEBIDA', triadaEm: null });
      expect(await transicoesGravadas(id)).toHaveLength(0);
      expect(notificacoes.eventoGravado).not.toHaveBeenCalled();
    });

    it('cidadão não muda status; corpo inválido dá 422 VALIDACAO; id inexistente, 404', async () => {
      const { id } = await inserir();
      const doCidadao = await transicionar(
        id,
        { status_esperado: 'RECEBIDA', para_status: 'EM_ANALISE' },
        tokens.cidadao,
      );
      expect(doCidadao.statusCode).toBe(403);
      expect(doCidadao.json<Erro>().codigo).toBe('ACESSO_NEGADO');

      const invalido = await requisitar(
        'POST',
        `atendimento/ocorrencias/${id}/transicoes`,
        tokens.agente,
        { status_esperado: 'RECEBIDO', para_status: 'EM_ANALISE' },
      );
      expect(invalido.statusCode).toBe(422);
      expect(invalido.json<Erro>().codigo).toBe('VALIDACAO');

      const inexistente = await transicionar(randomUUID(), {
        status_esperado: 'RECEBIDA',
        para_status: 'EM_ANALISE',
      });
      expect(inexistente.statusCode).toBe(404);
      expect(await transicoesGravadas(id)).toHaveLength(0);
    });
  });
});
