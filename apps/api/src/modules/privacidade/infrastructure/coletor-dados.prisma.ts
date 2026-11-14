import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { ColetorDados, DadosPessoais } from '../application/portas.js';

interface LinhaOcorrencia {
  id: string;
  protocolo: string;
  categoria: string;
  descricao: string;
  atributos: unknown;
  lat: number;
  lng: number;
  endereco: string | null;
  status: string;
  publicar_autor: boolean;
  criada_em: Date;
  resolvida_em: Date | null;
}

const iso = (data: Date): string => data.toISOString();
const isoOuNulo = (data: Date | null): string | null => data && data.toISOString();

/** Lê só o que é do usuário: a conta e as linhas em que ele é o autor ou o dono. */
@Injectable()
export class ColetorDadosPrisma implements ColetorDados {
  constructor(private readonly prisma: PrismaService) {}

  async coletar(usuarioId: string): Promise<DadosPessoais | null> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, anonimizadoEm: null },
    });
    if (!usuario) return null;

    const [ocorrencias, confirmacoes, avaliacoes] = await Promise.all([
      this.prisma.$queryRaw<LinhaOcorrencia[]>`
        SELECT o.id, o.protocolo, c.slug AS categoria, o.descricao, o.atributos,
               ST_Y(o.local::geometry) AS lat, ST_X(o.local::geometry) AS lng,
               o.endereco, o.status::text AS status, o.publicar_autor, o.criada_em, o.resolvida_em
        FROM ocorrencia o
        JOIN categoria c ON c.id = o.categoria_id
        WHERE o.autor_id = ${usuarioId}::uuid
        ORDER BY o.criada_em, o.id`,
      this.prisma.confirmacao.findMany({
        where: { usuarioId },
        select: { ocorrenciaId: true, criadaEm: true, ocorrencia: { select: { protocolo: true } } },
        orderBy: { criadaEm: 'asc' },
      }),
      this.prisma.avaliacao.findMany({
        where: { usuarioId },
        select: {
          ocorrenciaId: true,
          nota: true,
          comentario: true,
          criadaEm: true,
          ocorrencia: { select: { protocolo: true } },
        },
        orderBy: { criadaEm: 'asc' },
      }),
    ]);

    return {
      conta: {
        id: usuario.id,
        nome: usuario.nome,
        apelido_publico: usuario.apelidoPublico,
        email: usuario.email,
        papel: usuario.papel,
        criado_em: iso(usuario.criadoEm),
        politica_versao: usuario.politicaVersao,
        politica_aceita_em: isoOuNulo(usuario.politicaAceitaEm),
      },
      ocorrencias: ocorrencias.map((linha) => ({
        id: linha.id,
        protocolo: linha.protocolo,
        categoria: linha.categoria,
        descricao: linha.descricao,
        atributos: linha.atributos,
        local: { lat: linha.lat, lng: linha.lng },
        endereco: linha.endereco,
        status: linha.status,
        publicar_autor: linha.publicar_autor,
        criada_em: iso(linha.criada_em),
        resolvida_em: isoOuNulo(linha.resolvida_em),
      })),
      confirmacoes: confirmacoes.map((confirmacao) => ({
        ocorrencia_id: confirmacao.ocorrenciaId,
        protocolo: confirmacao.ocorrencia.protocolo,
        criada_em: iso(confirmacao.criadaEm),
      })),
      avaliacoes: avaliacoes.map((avaliacao) => ({
        ocorrencia_id: avaliacao.ocorrenciaId,
        protocolo: avaliacao.ocorrencia.protocolo,
        nota: avaliacao.nota,
        comentario: avaliacao.comentario,
        criada_em: iso(avaliacao.criadaEm),
      })),
    };
  }
}
