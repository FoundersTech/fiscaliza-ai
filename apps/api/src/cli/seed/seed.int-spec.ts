import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaClient } from '../../generated/prisma/client.js';
import { aplicarCargaInicial, SOROCABA } from './carga-inicial.js';
import { aplicarDadosDev, TOTAL_OCORRENCIAS_DEV, USUARIOS_DEV } from './dados-dev.js';

describe('Seed (carga inicial e dados de desenvolvimento)', () => {
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
    await prisma.$executeRaw`TRUNCATE municipio, categoria, usuario RESTART IDENTITY CASCADE`;
  });

  async function contar() {
    return {
      municipios: await prisma.municipio.count(),
      orgaos: await prisma.orgao.count(),
      categorias: await prisma.categoria.count(),
    };
  }

  it('rodar a carga inicial duas vezes não duplica nada', async () => {
    await aplicarCargaInicial(prisma);
    await aplicarCargaInicial(prisma);

    expect(await contar()).toEqual({ municipios: 1, orgaos: 1, categorias: 4 });
  });

  it('não sobrescreve o que o administrador editou', async () => {
    await aplicarCargaInicial(prisma);
    await prisma.orgao.update({
      where: { municipioId: SOROCABA.id },
      data: { nome: 'Secretaria de Serviços' },
    });
    await prisma.categoria.update({ where: { slug: 'iluminacao' }, data: { slaDias: 20 } });

    await aplicarCargaInicial(prisma);

    const orgao = await prisma.orgao.findUniqueOrThrow({ where: { municipioId: SOROCABA.id } });
    const categoria = await prisma.categoria.findUniqueOrThrow({ where: { slug: 'iluminacao' } });
    expect(orgao.nome).toBe('Secretaria de Serviços');
    expect(categoria.slaDias).toBe(20);
  });

  it('o centro de Sorocaba fica dentro de municipio.area, e São Paulo fica fora', async () => {
    await aplicarCargaInicial(prisma);

    const [resultado] = await prisma.$queryRaw<{ centro: boolean; saoPaulo: boolean }[]>`
      SELECT ST_Contains(area, ST_SetSRID(ST_MakePoint(-47.4526, -23.5015), 4326)) AS centro,
             ST_Contains(area, ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)) AS "saoPaulo"
      FROM municipio WHERE id = ${SOROCABA.id}`;

    expect(resultado).toEqual({ centro: true, saoPaulo: false });
  });

  it.each(['production', undefined, 'staging'])(
    'seed:dev se recusa a rodar com NODE_ENV=%s',
    async (nodeEnv) => {
      await expect(aplicarDadosDev(prisma, nodeEnv)).rejects.toThrow(/seed:dev só roda/);
      expect(await prisma.municipio.count()).toBe(0);
    },
  );

  it('seed:dev cria 1 usuário por papel e 50 ocorrências dentro do município, sem duplicar', async () => {
    const primeira = await aplicarDadosDev(prisma, 'test');
    const segunda = await aplicarDadosDev(prisma, 'test');

    expect(primeira).toEqual({ usuarios: 4, ocorrenciasCriadas: TOTAL_OCORRENCIAS_DEV });
    expect(segunda).toEqual({ usuarios: 4, ocorrenciasCriadas: 0 });
    expect(await prisma.usuario.count()).toBe(USUARIOS_DEV.length);

    const [resumo] = await prisma.$queryRaw<
      { total: number; dentro: number; protocolos: number; status: number; ultimo: number }[]
    >`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE ST_Contains(m.area, o.local::geometry))::int AS dentro,
             count(DISTINCT o.protocolo)::int AS protocolos,
             count(DISTINCT o.status)::int AS status,
             (SELECT max(ultimo) FROM protocolo_sequencia)::int AS ultimo
      FROM ocorrencia o JOIN municipio m ON m.id = o.municipio_id`;

    expect(resumo).toEqual({
      total: TOTAL_OCORRENCIAS_DEV,
      dentro: TOTAL_OCORRENCIAS_DEV,
      protocolos: TOTAL_OCORRENCIAS_DEV,
      status: 5,
      ultimo: expect.any(Number) as number,
    });
  });

  it('cada ocorrência do seed:dev tem a linha do tempo coerente com o status', async () => {
    await aplicarDadosDev(prisma, 'test');

    const ocorrencias = await prisma.ocorrencia.findMany({
      select: {
        status: true,
        triadaEm: true,
        resolvidaEm: true,
        eventos: { orderBy: { criadoEm: 'asc' }, select: { deStatus: true, paraStatus: true } },
      },
    });

    for (const ocorrencia of ocorrencias) {
      const ultimo = ocorrencia.eventos.at(-1)!;
      expect(ocorrencia.eventos[0]).toEqual({ deStatus: null, paraStatus: 'RECEBIDA' });
      expect(ultimo.paraStatus).toBe(ocorrencia.status);
      expect(ocorrencia.triadaEm === null).toBe(ocorrencia.status === 'RECEBIDA');
      expect(ocorrencia.resolvidaEm === null).toBe(ocorrencia.status !== 'RESOLVIDA');
    }
  });
});
