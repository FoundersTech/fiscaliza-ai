import { randomUUID } from 'node:crypto';

import {
  PapelUsuario,
  StatusOcorrencia,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import { HasherArgon2 } from '../../modules/identidade/infrastructure/hasher-argon2.js';
import { Protocolo } from '../../modules/ocorrencias/domain/protocolo.js';
import { aplicarCargaInicial, CATEGORIAS, SOROCABA } from './carga-inicial.js';

/**
 * Dados de desenvolvimento: 1 usuário por papel e 50 ocorrências espalhadas pela área
 * urbana de Sorocaba, em vários status. Só roda com NODE_ENV=development ou test, declarado
 * explicitamente: sem NODE_ENV, a recusa protege um servidor que esqueceu a variável.
 */

const AMBIENTES_PERMITIDOS = ['development', 'test'];

export const TOTAL_OCORRENCIAS_DEV = 50;

/** Senha dos usuários de teste. Só existe em desenvolvimento e testes */
export const SENHA_DEV = 'fiscaliza123';

/** Versão da política já aceita pelos usuários de teste, para o app não pedir o aceite. */
const POLITICA_VERSAO_DEV = '1';

export const USUARIOS_DEV = [
  {
    papel: PapelUsuario.CIDADAO,
    nome: 'Cidadã de Teste',
    apelidoPublico: 'cidada.teste',
    email: 'cidadao@fiscaliza.test',
  },
  {
    papel: PapelUsuario.AGENTE_ORGAO,
    nome: 'Agente de Teste',
    apelidoPublico: 'agente.teste',
    email: 'agente@fiscaliza.test',
  },
  {
    papel: PapelUsuario.ADMIN_MUNICIPIO,
    nome: 'Gestora de Teste',
    apelidoPublico: 'gestora.teste',
    email: 'gestor@fiscaliza.test',
  },
  {
    papel: PapelUsuario.ADMIN_PLATAFORMA,
    nome: 'Admin de Teste',
    apelidoPublico: 'admin.teste',
    email: 'admin@fiscaliza.test',
  },
] as const;

/** Retângulo da área urbana, para os pontos não caírem na zona rural. */
const AREA_URBANA = { oeste: -47.53, sul: -23.57, leste: -47.37, norte: -23.42 } as const;

const DESCRICOES: Record<(typeof CATEGORIAS)[number]['slug'], readonly string[]> = {
  pavimentacao: [
    'Buraco grande no asfalto, os carros estão desviando pela contramão.',
    'Asfalto afundado perto da faixa de pedestres.',
  ],
  iluminacao: [
    'Poste com a lâmpada apagada há mais de uma semana.',
    'Lâmpada do poste fica acesa o dia inteiro.',
  ],
  'limpeza-urbana': ['Entulho e lixo acumulados na calçada.', 'Mato alto tomando conta da praça.'],
  'agua-esgoto': [
    'Vazamento de água na calçada, escorrendo para a rua.',
    'Bueiro entupido e com mau cheiro.',
  ],
};

/** Transições até o status final, na ordem do fluxo do agente. */
const CAMINHOS: Record<string, readonly StatusOcorrencia[]> = {
  [StatusOcorrencia.RECEBIDA]: [],
  [StatusOcorrencia.EM_ANALISE]: [StatusOcorrencia.EM_ANALISE],
  [StatusOcorrencia.EM_EXECUCAO]: [StatusOcorrencia.EM_ANALISE, StatusOcorrencia.EM_EXECUCAO],
  [StatusOcorrencia.RESOLVIDA]: [
    StatusOcorrencia.EM_ANALISE,
    StatusOcorrencia.EM_EXECUCAO,
    StatusOcorrencia.RESOLVIDA,
  ],
  [StatusOcorrencia.RECUSADA]: [StatusOcorrencia.EM_ANALISE, StatusOcorrencia.RECUSADA],
};

/** Proporção aproximada de status: mais abertas que fechadas, como num uso real. */
const STATUS_EM_CICLO = [
  StatusOcorrencia.RECEBIDA,
  StatusOcorrencia.RECEBIDA,
  StatusOcorrencia.EM_ANALISE,
  StatusOcorrencia.EM_EXECUCAO,
  StatusOcorrencia.RESOLVIDA,
  StatusOcorrencia.RESOLVIDA,
  StatusOcorrencia.RECUSADA,
] as const;

const COMENTARIOS: Partial<Record<StatusOcorrencia, string>> = {
  [StatusOcorrencia.RESOLVIDA]: 'Serviço concluído pela equipe de manutenção.',
  [StatusOcorrencia.RECUSADA]: 'O local fica em via estadual, fora da competência da prefeitura.',
};

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export class ErroAmbienteSeedDev extends Error {
  constructor(nodeEnv: string | undefined) {
    super(
      `seed:dev só roda com NODE_ENV=development ou test (atual: ${nodeEnv ?? 'não definido'}). ` +
        'Os dados de teste nunca devem chegar à produção.',
    );
    this.name = 'ErroAmbienteSeedDev';
  }
}

export interface ResumoDadosDev {
  usuarios: number;
  ocorrenciasCriadas: number;
}

export async function aplicarDadosDev(
  prisma: PrismaClient,
  nodeEnv: string | undefined,
  agora = new Date(),
): Promise<ResumoDadosDev> {
  if (!nodeEnv || !AMBIENTES_PERMITIDOS.includes(nodeEnv)) {
    throw new ErroAmbienteSeedDev(nodeEnv);
  }

  const { orgaoId } = await aplicarCargaInicial(prisma);
  const usuarios = await garantirUsuarios(prisma, orgaoId, agora);

  const cidadaoId = usuarios.get(PapelUsuario.CIDADAO)!;
  const jaCriadas = await prisma.ocorrencia.count({ where: { autorId: cidadaoId } });
  if (jaCriadas > 0) {
    return { usuarios: usuarios.size, ocorrenciasCriadas: 0 };
  }

  const agenteId = usuarios.get(PapelUsuario.AGENTE_ORGAO)!;
  const categorias = await prisma.categoria.findMany({
    where: { slug: { in: CATEGORIAS.map((categoria) => categoria.slug) } },
  });
  const pontos = await gerarPontos(prisma);

  for (const [indice, ponto] of pontos.entries()) {
    const slug = CATEGORIAS[indice % CATEGORIAS.length]!.slug;
    const categoria = categorias.find((item) => item.slug === slug)!;
    await criarOcorrencia(prisma, {
      indice,
      ponto,
      categoriaId: categoria.id,
      descricao: DESCRICOES[slug][Math.floor(indice / CATEGORIAS.length) % 2]!,
      orgaoId,
      cidadaoId,
      agenteId,
      agora,
    });
  }

  return { usuarios: usuarios.size, ocorrenciasCriadas: pontos.length };
}

async function garantirUsuarios(
  prisma: PrismaClient,
  orgaoId: number,
  agora: Date,
): Promise<Map<PapelUsuario, string>> {
  const senhaHash = await new HasherArgon2().gerar(SENHA_DEV);
  const ids = new Map<PapelUsuario, string>();
  for (const usuario of USUARIOS_DEV) {
    const existente = await prisma.usuario.findFirst({
      where: { email: { equals: usuario.email, mode: 'insensitive' } },
      select: { id: true, senhaHash: true },
    });
    if (existente) {
      // Bancos criados antes da senha de teste: os usuários ganham a senha sem serem recriados.
      if (!existente.senhaHash) {
        await prisma.usuario.update({ where: { id: existente.id }, data: { senhaHash } });
      }
      ids.set(usuario.papel, existente.id);
      continue;
    }
    const { id } = await prisma.usuario.create({
      data: {
        ...usuario,
        senhaHash,
        politicaVersao: POLITICA_VERSAO_DEV,
        politicaAceitaEm: agora,
        municipioId: usuario.papel === PapelUsuario.ADMIN_PLATAFORMA ? null : SOROCABA.id,
        orgaoId: usuario.papel === PapelUsuario.AGENTE_ORGAO ? orgaoId : null,
      },
    });
    ids.set(usuario.papel, id);
  }
  return ids;
}

interface Ponto {
  lng: number;
  lat: number;
}

/** Pontos aleatórios dentro do município, com semente fixa: a mesma base a cada execução. */
function gerarPontos(prisma: PrismaClient): Promise<Ponto[]> {
  const { oeste, sul, leste, norte } = AREA_URBANA;
  return prisma.$queryRaw<Ponto[]>`
    SELECT ST_X(ponto.geom) AS lng, ST_Y(ponto.geom) AS lat
    FROM municipio,
         ST_Dump(ST_GeneratePoints(
           ST_Intersection(area, ST_MakeEnvelope(${oeste}, ${sul}, ${leste}, ${norte}, 4326)),
           ${TOTAL_OCORRENCIAS_DEV}::int, 2026)) AS ponto
    WHERE municipio.id = ${SOROCABA.id}`;
}

interface DadosOcorrencia {
  indice: number;
  ponto: Ponto;
  categoriaId: number;
  descricao: string;
  orgaoId: number;
  cidadaoId: string;
  agenteId: string;
  agora: Date;
}

async function criarOcorrencia(prisma: PrismaClient, dados: DadosOcorrencia): Promise<void> {
  const { indice, ponto, agora } = dados;
  const status = STATUS_EM_CICLO[indice % STATUS_EM_CICLO.length]!;
  const caminho = CAMINHOS[status]!;

  // Datas espalhadas pelos últimos 60 dias; as transições ficam entre a criação e agora.
  const criadaEm = new Date(agora.getTime() - (((indice * 7) % 60) + 1) * UM_DIA_MS);
  const passo = (agora.getTime() - criadaEm.getTime()) / (caminho.length + 1);
  const transicoes = caminho.map((paraStatus, posicao) => ({
    paraStatus,
    criadoEm: new Date(criadaEm.getTime() + passo * (posicao + 1)),
  }));
  const triadaEm = transicoes[0]?.criadoEm ?? null;
  const resolvidaEm =
    transicoes.find((transicao) => transicao.paraStatus === StatusOcorrencia.RESOLVIDA)?.criadoEm ??
    null;

  await prisma.$transaction(async (tx) => {
    const ano = criadaEm.getUTCFullYear();
    const [sequencia] = await tx.$queryRaw<{ ultimo: number }[]>`
      INSERT INTO protocolo_sequencia (municipio_id, ano, ultimo)
      VALUES (${SOROCABA.id}, ${ano}, 1)
      ON CONFLICT (municipio_id, ano)
      DO UPDATE SET ultimo = protocolo_sequencia.ultimo + 1
      RETURNING ultimo`;
    const protocolo = Protocolo.formatar(ano, SOROCABA.sigla, sequencia!.ultimo);

    const id = randomUUID();
    await tx.$executeRaw`
      INSERT INTO ocorrencia (id, protocolo, autor_id, categoria_id, municipio_id, orgao_id,
                              descricao, local, endereco, status, criada_em, triada_em, resolvida_em)
      VALUES (${id}::uuid, ${protocolo}, ${dados.cidadaoId}::uuid, ${dados.categoriaId},
              ${SOROCABA.id}, ${dados.orgaoId}, ${dados.descricao},
              ST_SetSRID(ST_MakePoint(${ponto.lng}, ${ponto.lat}), 4326)::geography,
              ${`Endereço de teste, ${indice + 1}`}, ${status}::status_ocorrencia,
              ${criadaEm}, ${triadaEm}, ${resolvidaEm})`;

    let anterior: StatusOcorrencia = StatusOcorrencia.RECEBIDA;
    await tx.ocorrenciaEvento.createMany({
      data: [
        {
          ocorrenciaId: id,
          paraStatus: StatusOcorrencia.RECEBIDA,
          autorId: dados.cidadaoId,
          criadoEm: criadaEm,
        },
        ...transicoes.map(({ paraStatus, criadoEm }) => {
          const evento = {
            ocorrenciaId: id,
            deStatus: anterior,
            paraStatus,
            autorId: dados.agenteId,
            orgaoId: dados.orgaoId,
            comentario: COMENTARIOS[paraStatus] ?? null,
            criadoEm,
          };
          anterior = paraStatus;
          return evento;
        }),
      ],
    });
  });
}
