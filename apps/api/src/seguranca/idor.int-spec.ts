import { randomUUID } from 'node:crypto';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.js';
import { configurarApp, PREFIXO_API } from '../app.setup.js';
import { aplicarCargaInicial, SOROCABA } from '../cli/seed/carga-inicial.js';
import { EMISSOR_TOKEN, type EmissorToken } from '../modules/identidade/application/portas.js';
import { Papel } from '../modules/identidade/domain/papel.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';

/** Outro município, longe de Sorocaba, com o seu próprio órgão e o seu próprio gestor. */
const OUTRO = { id: 3523909, nome: 'Itu', uf: 'SP', sigla: 'ITU' } as const;

/** Quem tenta o acesso. Cada um é uma conta real, com a política aceita. */
type Ator =
  | 'cidadao'
  | 'agente'
  | 'gestorSorocaba'
  | 'gestorOutroMunicipio'
  | 'agenteOutroMunicipio'
  | 'adminPlataforma';

/** Recursos de Sorocaba que os casos usam nas rotas com id. */
interface Recursos {
  agenteSorocaba: string;
  categoria: number;
  foto: string;
  ocorrenciaSorocaba: string;
}

interface Caso {
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  rota: (recursos: Recursos) => string;
  /** Corpo válido: se o guard sumir, a rota funciona e o teste falha com 200 ou 201. */
  corpo?: object;
  /** Quem NÃO pode chamar a rota, e o código esperado no 403. */
  negados: Partial<Record<Ator, 'ACESSO_NEGADO' | 'OUTRO_MUNICIPIO' | 'OUTRO_ORGAO'>>;
}

const FORA_DO_MUNICIPIO = {
  cidadao: 'ACESSO_NEGADO',
  agente: 'ACESSO_NEGADO',
  agenteOutroMunicipio: 'ACESSO_NEGADO',
  adminPlataforma: 'ACESSO_NEGADO',
} as const;

const FORA_DA_PLATAFORMA = {
  cidadao: 'ACESSO_NEGADO',
  agente: 'ACESSO_NEGADO',
  gestorSorocaba: 'ACESSO_NEGADO',
  gestorOutroMunicipio: 'ACESSO_NEGADO',
} as const;

const FORA_DO_ATENDIMENTO = {
  cidadao: 'ACESSO_NEGADO',
  gestorSorocaba: 'ACESSO_NEGADO',
  gestorOutroMunicipio: 'ACESSO_NEGADO',
  adminPlataforma: 'ACESSO_NEGADO',
} as const;

/**
 * Todo endpoint de admin, com quem não pode chamá-lo. As rotas de admin do município sem id
 * (órgão, lista e convite de agentes) tiram o município do token, então o gestor de outro
 * município só alcança o dele; a rota com id confere o município do recurso. Para cobrir uma
 * rota nova (as do agente, por exemplo), basta acrescentar o caso aqui.
 */
const CASOS: Record<string, Caso> = {
  'GET /admin/orgao': { metodo: 'GET', rota: () => 'admin/orgao', negados: FORA_DO_MUNICIPIO },
  'PATCH /admin/orgao': {
    metodo: 'PATCH',
    rota: () => 'admin/orgao',
    corpo: { nome: 'Órgão invadido' },
    negados: FORA_DO_MUNICIPIO,
  },
  'GET /admin/agentes': {
    metodo: 'GET',
    rota: () => 'admin/agentes',
    negados: FORA_DO_MUNICIPIO,
  },
  'POST /admin/agentes': {
    metodo: 'POST',
    rota: () => 'admin/agentes',
    corpo: { nome: 'Agente Intruso', email: 'intruso@exemplo.test' },
    negados: FORA_DO_MUNICIPIO,
  },
  'PATCH /admin/agentes/:id': {
    metodo: 'PATCH',
    rota: ({ agenteSorocaba }) => `admin/agentes/${agenteSorocaba}`,
    corpo: { ativo: false },
    negados: { ...FORA_DO_MUNICIPIO, gestorOutroMunicipio: 'OUTRO_MUNICIPIO' },
  },
  'POST /admin/gestores': {
    metodo: 'POST',
    rota: () => 'admin/gestores',
    corpo: { nome: 'Gestor Intruso', email: 'gestor@exemplo.test', municipio_id: SOROCABA.id },
    negados: FORA_DA_PLATAFORMA,
  },
  'GET /admin/categorias': {
    metodo: 'GET',
    rota: () => 'admin/categorias',
    negados: FORA_DA_PLATAFORMA,
  },
  'POST /admin/categorias': {
    metodo: 'POST',
    rota: () => 'admin/categorias',
    corpo: {
      slug: 'intrusa',
      nome: 'Categoria intrusa',
      icone: 'warning',
      sla_dias: 10,
      schema_atributos: [],
    },
    negados: FORA_DA_PLATAFORMA,
  },
  'PATCH /admin/categorias/:id': {
    metodo: 'PATCH',
    rota: ({ categoria }) => `admin/categorias/${categoria}`,
    corpo: { ativa: false },
    negados: FORA_DA_PLATAFORMA,
  },
  'GET /admin/fotos': { metodo: 'GET', rota: () => 'admin/fotos', negados: FORA_DA_PLATAFORMA },
  'POST /admin/fotos/:id/rejeicao': {
    metodo: 'POST',
    rota: ({ foto }) => `admin/fotos/${foto}/rejeicao`,
    corpo: { motivo: 'Tentativa de quem não pode' },
    negados: FORA_DA_PLATAFORMA,
  },
  'GET /atendimento/ocorrencias': {
    metodo: 'GET',
    rota: () => 'atendimento/ocorrencias',
    negados: FORA_DO_ATENDIMENTO,
  },
  'GET /atendimento/ocorrencias/:id': {
    metodo: 'GET',
    rota: ({ ocorrenciaSorocaba }) => `atendimento/ocorrencias/${ocorrenciaSorocaba}`,
    negados: { ...FORA_DO_ATENDIMENTO, agenteOutroMunicipio: 'OUTRO_ORGAO' },
  },
  'POST /atendimento/ocorrencias/:id/transicoes': {
    metodo: 'POST',
    rota: ({ ocorrenciaSorocaba }) => `atendimento/ocorrencias/${ocorrenciaSorocaba}/transicoes`,
    corpo: { status_esperado: 'RECEBIDA', para_status: 'EM_ANALISE' },
    negados: { ...FORA_DO_ATENDIMENTO, agenteOutroMunicipio: 'OUTRO_ORGAO' },
  },
};

describe('Acesso a dados de outro município ou de outro papel', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let orgaoSorocaba: number;
  let orgaoOutro: number;
  const tokens = {} as Record<Ator, string>;
  let recursos: Recursos;

  async function conta(
    papel: Papel,
    municipioId: number | null,
    orgaoId: number | null = null,
  ): Promise<{ id: string; token: string }> {
    const usuario = await prisma.usuario.create({
      data: {
        nome: 'Pessoa de Teste',
        apelidoPublico: 'pessoa',
        email: `${randomUUID()}@exemplo.test`,
        senhaHash: 'sem-uso',
        papel,
        municipioId,
        orgaoId,
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

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configurarApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);

    await prisma.$executeRaw`TRUNCATE ocorrencia, usuario RESTART IDENTITY CASCADE`;
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

    const cidadao = await conta(Papel.CIDADAO, null);
    tokens.cidadao = cidadao.token;
    const agente = await conta(Papel.AGENTE_ORGAO, SOROCABA.id, orgaoSorocaba);
    tokens.agente = agente.token;
    tokens.gestorSorocaba = (await conta(Papel.ADMIN_MUNICIPIO, SOROCABA.id)).token;
    tokens.gestorOutroMunicipio = (await conta(Papel.ADMIN_MUNICIPIO, OUTRO.id)).token;
    tokens.agenteOutroMunicipio = (await conta(Papel.AGENTE_ORGAO, OUTRO.id, orgaoOutro)).token;
    tokens.adminPlataforma = (await conta(Papel.ADMIN_PLATAFORMA, null)).token;

    const categoria = await prisma.categoria.findFirstOrThrow({
      where: { ativa: true },
      orderBy: { id: 'asc' },
    });
    const ocorrenciaSorocaba = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, status)
      VALUES (${ocorrenciaSorocaba}::uuid, 'FA-2026-SOR-000777', ${cidadao.id}::uuid,
              ${categoria.id}, ${SOROCABA.id}, ${orgaoSorocaba},
              'Poste sem iluminação na esquina da praça',
              ST_SetSRID(ST_MakePoint(-47.4526::float8, -23.5015::float8), 4326)::geography,
              'RECEBIDA'::status_ocorrencia)`;
    recursos = {
      agenteSorocaba: agente.id,
      categoria: categoria.id,
      foto: randomUUID(),
      ocorrenciaSorocaba,
    };
  });

  afterAll(async () => {
    await prisma.$executeRaw`TRUNCATE ocorrencia, usuario RESTART IDENTITY CASCADE`;
    await prisma.orgao.deleteMany({ where: { municipioId: OUTRO.id } });
    await prisma.municipio.deleteMany({ where: { id: OUTRO.id } });
    await app.close();
  });

  const tentativas = Object.entries(CASOS).flatMap(([nome, caso]) =>
    Object.entries(caso.negados).map(([ator, codigo]) => ({
      nome,
      caso,
      ator: ator as Ator,
      codigo,
    })),
  );

  it.each(tentativas)('$nome por $ator: 403 $codigo', async ({ caso, ator, codigo }) => {
    const resposta = await app.inject({
      method: caso.metodo,
      url: `/${PREFIXO_API}/${caso.rota(recursos)}`,
      headers: { authorization: `Bearer ${tokens[ator]}` },
      ...(caso.corpo ? { payload: caso.corpo } : {}),
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json()).toMatchObject({ codigo });
  });

  it('nenhuma tentativa negada mudou os dados de Sorocaba', async () => {
    expect(
      await prisma.usuario.findUniqueOrThrow({ where: { id: recursos.agenteSorocaba } }),
    ).toMatchObject({ ativo: true });
    expect((await prisma.orgao.findUniqueOrThrow({ where: { id: orgaoSorocaba } })).nome).not.toBe(
      'Órgão invadido',
    );
    expect(
      await prisma.categoria.findUniqueOrThrow({ where: { id: recursos.categoria } }),
    ).toMatchObject({ ativa: true });
    expect(await prisma.categoria.count({ where: { slug: 'intrusa' } })).toBe(0);
    expect(
      await prisma.usuario.count({
        where: { email: { in: ['intruso@exemplo.test', 'gestor@exemplo.test'] } },
      }),
    ).toBe(0);
    expect(
      await prisma.ocorrencia.findUniqueOrThrow({ where: { id: recursos.ocorrenciaSorocaba } }),
    ).toMatchObject({ status: 'RECEBIDA' });
  });

  it('o gestor de Sorocaba chega às rotas do município, o admin da plataforma às dele e o agente ao atendimento', async () => {
    const pedir = (rota: string, ator: Ator) =>
      app.inject({
        method: 'GET',
        url: `/${PREFIXO_API}/${rota}`,
        headers: { authorization: `Bearer ${tokens[ator]}` },
      });

    expect((await pedir('admin/orgao', 'gestorSorocaba')).statusCode).toBe(200);
    expect((await pedir('admin/agentes', 'gestorSorocaba')).statusCode).toBe(200);
    expect((await pedir('admin/categorias', 'adminPlataforma')).statusCode).toBe(200);
    expect((await pedir('admin/fotos', 'adminPlataforma')).statusCode).toBe(200);
    expect((await pedir('atendimento/ocorrencias', 'agente')).statusCode).toBe(200);
    expect(
      (await pedir(`atendimento/ocorrencias/${recursos.ocorrenciaSorocaba}`, 'agente')).statusCode,
    ).toBe(200);
  });
});
