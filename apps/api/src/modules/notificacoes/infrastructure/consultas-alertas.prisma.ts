import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';
import type { ConsultasAlertas, LinhaAlerta } from '../application/alertas.js';

/** Recusada e duplicada só aparecem para o autor; quem confirmou nem conseguiria abrir. */
const SO_PARA_O_AUTOR = [StatusOcorrencia.RECUSADA, StatusOcorrencia.DUPLICADA];

/**
 * Quando o evento `e` (da ocorrência `o`) vira alerta para a pessoa `usuario`. É a única
 * definição da regra: a aba Alertas, o indicador e os destinatários do push usam este trecho.
 * - não é o evento de criação;
 * - não foi a própria pessoa quem fez a mudança (o agente, ou o cidadão que reabriu);
 * - a pessoa é a autora, ou confirmou até o momento da mudança (quem confirmou depois não recebe).
 */
function ehAlertaPara(usuario: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    e.de_status IS NOT NULL
    AND e.autor_id IS DISTINCT FROM ${usuario}
    AND (
      o.autor_id = ${usuario}
      OR (
        e.para_status <> ALL(${SO_PARA_O_AUTOR}::status_ocorrencia[])
        AND EXISTS (
          SELECT 1 FROM confirmacao c
          WHERE c.ocorrencia_id = e.ocorrencia_id
            AND c.usuario_id = ${usuario}
            AND c.criada_em <= e.criado_em
        )
      )
    )`;
}

/** Ocorrências que a pessoa registrou ou confirmou: só os eventos delas podem virar alerta. */
function ocorrenciasDaPessoa(usuarioId: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT id FROM ocorrencia WHERE autor_id = ${usuarioId}::uuid
    UNION
    SELECT ocorrencia_id FROM confirmacao WHERE usuario_id = ${usuarioId}::uuid
  )`;
}

@Injectable()
export class ConsultasAlertasPrisma implements ConsultasAlertas {
  constructor(private readonly prisma: PrismaService) {}

  daPessoa(usuarioId: string, antesDe: number | null, limite: number): Promise<LinhaAlerta[]> {
    const usuario = Prisma.sql`${usuarioId}::uuid`;
    return this.prisma.$queryRaw<LinhaAlerta[]>`
      SELECT e.id AS "eventoId", e.ocorrencia_id AS "ocorrenciaId", o.protocolo,
             e.de_status AS "deStatus", e.para_status AS "paraStatus", e.criado_em AS "criadoEm"
      FROM ocorrencia_evento e
      JOIN ocorrencia o ON o.id = e.ocorrencia_id
      WHERE e.ocorrencia_id IN ${ocorrenciasDaPessoa(usuarioId)}
        AND ${ehAlertaPara(usuario)}
        ${antesDe === null ? Prisma.empty : Prisma.sql`AND e.id < ${antesDe}::int`}
      ORDER BY e.id DESC
      LIMIT ${limite}::int`;
  }

  async contarNovos(usuarioId: string): Promise<number> {
    const usuario = Prisma.sql`${usuarioId}::uuid`;
    const [linha] = await this.prisma.$queryRaw<{ quantidade: number }[]>`
      SELECT count(*)::int AS quantidade
      FROM ocorrencia_evento e
      JOIN ocorrencia o ON o.id = e.ocorrencia_id
      WHERE e.ocorrencia_id IN ${ocorrenciasDaPessoa(usuarioId)}
        AND ${ehAlertaPara(usuario)}
        AND e.criado_em > COALESCE(
          (SELECT alertas_vistos_em FROM usuario WHERE id = ${usuarioId}::uuid),
          '-infinity'::timestamptz
        )`;
    return linha?.quantidade ?? 0;
  }

  async marcarVistos(usuarioId: string, quando: Date): Promise<void> {
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { alertasVistosEm: quando },
    });
  }

  async destinatarios(eventoId: number): Promise<string[]> {
    const linhas = await this.prisma.$queryRaw<{ usuarioId: string }[]>`
      SELECT DISTINCT p.usuario_id AS "usuarioId"
      FROM ocorrencia_evento e
      JOIN ocorrencia o ON o.id = e.ocorrencia_id
      CROSS JOIN LATERAL (
        SELECT o.autor_id AS usuario_id
        UNION
        SELECT c.usuario_id FROM confirmacao c WHERE c.ocorrencia_id = o.id
      ) p
      JOIN usuario u ON u.id = p.usuario_id AND u.ativo AND u.anonimizado_em IS NULL
      WHERE e.id = ${eventoId}::int
        AND ${ehAlertaPara(Prisma.sql`p.usuario_id`)}
      ORDER BY p.usuario_id`;
    return linhas.map((linha) => linha.usuarioId);
  }
}
