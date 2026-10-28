import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PapelUsuario, PrismaClient } from '../../generated/prisma/client.js';

const SOROCABA = 3552205;
const PRISMA_CLI = createRequire(import.meta.url).resolve('prisma/build/index.js');
const PASTA_API = fileURLToPath(new URL('../../..', import.meta.url));

describe('Schema do banco (migrations aplicadas num banco vazio)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // O CASCADE limpa as tabelas que dependem destas (órgão, ocorrências, tokens…).
    await prisma.$executeRaw`TRUNCATE municipio, categoria, usuario RESTART IDENTITY CASCADE`;
  });

  async function criarMunicipio(id = SOROCABA, sigla = 'SOR'): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO municipio (id, nome, uf, sigla, ativo, area)
      VALUES (${id}, 'Sorocaba', 'SP', ${sigla}, true,
              ST_Multi(ST_MakeEnvelope(-47.6, -23.6, -47.3, -23.3, 4326)))`;
  }

  async function criarOcorrencia(id = randomUUID()): Promise<string> {
    await criarMunicipio();
    const orgao = await prisma.orgao.create({
      data: { municipioId: SOROCABA, nome: 'Prefeitura de Sorocaba', sigla: 'PMS' },
    });
    const categoria = await prisma.categoria.create({
      data: { slug: 'iluminacao', nome: 'Iluminação', icone: 'lightbulb', slaDias: 15 },
    });
    await prisma.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, categoria_id, municipio_id, orgao_id, descricao, local)
      VALUES (${id}::uuid, 'FA-2026-SOR-000001', ${categoria.id}, ${SOROCABA}, ${orgao.id},
              'Poste apagado há uma semana',
              ST_SetSRID(ST_MakePoint(-47.45, -23.5), 4326)::geography)`;
    return id;
  }

  function criarCidadao(email: string) {
    return prisma.usuario.create({
      data: { nome: 'Maria', apelidoPublico: 'maria', email, papel: PapelUsuario.CIDADAO },
    });
  }

  it('rejeita e-mail repetido sem diferenciar maiúsculas', async () => {
    await criarCidadao('A@x.com');

    await expect(criarCidadao('a@x.com')).rejects.toThrow(/usuario_email_lower_key/);
  });

  it('rejeita uma ocorrência marcada como duplicada dela mesma', async () => {
    const id = await criarOcorrencia();

    await expect(
      prisma.ocorrencia.update({ where: { id }, data: { duplicadaDeId: id } }),
    ).rejects.toThrow(/ocorrencia_duplicada_de_id_check/);
  });

  it('preenche local_publico igual a local no insert e no update', async () => {
    const id = await criarOcorrencia();
    await prisma.$executeRaw`
      UPDATE ocorrencia SET local = ST_SetSRID(ST_MakePoint(-47.44, -23.51), 4326)::geography
      WHERE id = ${id}::uuid`;

    const [linha] = await prisma.$queryRaw<{ iguais: boolean; publico: string }[]>`
      SELECT ST_Equals(local::geometry, local_publico::geometry) AS iguais,
             ST_AsText(local_publico) AS publico
      FROM ocorrencia WHERE id = ${id}::uuid`;

    expect(linha).toEqual({ iguais: true, publico: 'POINT(-47.44 -23.51)' });
  });

  it('rejeita um segundo órgão no mesmo município', async () => {
    await criarMunicipio();
    await prisma.orgao.create({
      data: { municipioId: SOROCABA, nome: 'Prefeitura', sigla: 'PMS' },
    });

    await expect(
      prisma.orgao.create({ data: { municipioId: SOROCABA, nome: 'Outro órgão', sigla: 'OUT' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('exige órgão para AGENTE_ORGAO', async () => {
    await expect(
      prisma.usuario.create({
        data: {
          nome: 'João',
          apelidoPublico: 'joao',
          email: 'joao@x.com',
          papel: PapelUsuario.AGENTE_ORGAO,
        },
      }),
    ).rejects.toThrow(/usuario_agente_orgao_check/);
  });

  it('rejeita protocolo fora do formato FA-AAAA-SIG-NNNNNN', async () => {
    const id = await criarOcorrencia();

    await expect(
      prisma.ocorrencia.update({ where: { id }, data: { protocolo: 'FA-26-SOR-1' } }),
    ).rejects.toThrow(/ocorrencia_protocolo_check/);
  });

  it('schema.prisma e migrations descrevem o mesmo banco', async () => {
    // Uma mudança no schema.prisma sem migration (ou o contrário) aparece aqui como diferença.
    const resultado = promisify(execFile)(
      process.execPath,
      [
        PRISMA_CLI,
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { cwd: PASTA_API, env: process.env },
    );

    await expect(resultado).resolves.toMatchObject({
      stdout: expect.stringContaining('No difference detected') as unknown,
    });
  }, 30_000);
});
