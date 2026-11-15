import { Inject, Injectable } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { type StatusExibido, statusExibidoDe } from '../../ocorrencias/domain/exibicao-publica.js';
import { StatusOcorrencia } from '../../ocorrencias/domain/ocorrencia.js';

/**
 * Leituras dos alertas. Não há tabela de alertas: cada mudança de status gravada em
 * `ocorrencia_evento` vira aviso para o autor e para quem confirmou antes dela, nunca para quem
 * fez a mudança. A mesma regra decide quem recebe o push do evento.
 */
export const CONSULTAS_ALERTAS = Symbol('CONSULTAS_ALERTAS');

/** Um evento que virou alerta para a pessoa, como vem do banco. */
export interface LinhaAlerta {
  eventoId: number;
  ocorrenciaId: string;
  protocolo: string;
  deStatus: StatusOcorrencia;
  paraStatus: StatusOcorrencia;
  criadoEm: Date;
}

export interface ConsultasAlertas {
  /** Até `limite` alertas da pessoa, do mais recente para o mais antigo, antes do evento `antesDe`. */
  daPessoa(usuarioId: string, antesDe: number | null, limite: number): Promise<LinhaAlerta[]>;
  /** Alertas da pessoa gravados depois da última vez que ela abriu a aba (todos, se nunca abriu). */
  contarNovos(usuarioId: string): Promise<number>;
  /** Guarda o momento em que a pessoa viu os alertas. */
  marcarVistos(usuarioId: string, quando: Date): Promise<void>;
  /** Quem recebe o aviso do evento; vazio para o evento de criação ou evento inexistente. */
  destinatarios(eventoId: number): Promise<string[]>;
}

export interface Alerta {
  eventoId: number;
  ocorrenciaId: string;
  protocolo: string;
  paraStatusPublico: StatusExibido;
  /** A mudança foi a reabertura pelo cidadão: de resolvida de volta para em análise. */
  reaberta: boolean;
  criadoEm: Date;
}

export interface PaginaAlertas {
  itens: Alerta[];
  proximoCursor: string | null;
}

export interface PedidoAlertas {
  usuarioId: string;
  cursor?: string | null;
  limite: number;
}

export function ehReabertura(de: StatusOcorrencia, para: StatusOcorrencia): boolean {
  return de === StatusOcorrencia.RESOLVIDA && para === StatusOcorrencia.EM_ANALISE;
}

/** O cursor é o id do último evento da página: os eventos são listados do id maior para o menor. */
const CursorAlertas = {
  codificar(eventoId: number): string {
    return String(eventoId);
  },
  decodificar(cursor: string): number {
    const id = /^[1-9]\d{0,15}$/.test(cursor) ? Number(cursor) : NaN;
    if (!Number.isSafeInteger(id)) {
      throw new ErroAplicacao('VALIDACAO', 'Dados inválidos.', 422, {
        campos: { cursor: ['cursor inválido; recomece pela primeira página'] },
      });
    }
    return id;
  },
};

/** A aba Alertas: as mudanças de status das ocorrências que a pessoa registrou ou confirmou. */
@Injectable()
export class ListarAlertas {
  constructor(@Inject(CONSULTAS_ALERTAS) private readonly consultas: ConsultasAlertas) {}

  async executar(pedido: PedidoAlertas): Promise<PaginaAlertas> {
    const antesDe = pedido.cursor ? CursorAlertas.decodificar(pedido.cursor) : null;
    // Um item a mais diz se existe próxima página sem precisar contar.
    const linhas = await this.consultas.daPessoa(pedido.usuarioId, antesDe, pedido.limite + 1);
    const pagina = linhas.slice(0, pedido.limite);
    const ultima = pagina.at(-1);
    return {
      itens: pagina.map((linha) => ({
        eventoId: linha.eventoId,
        ocorrenciaId: linha.ocorrenciaId,
        protocolo: linha.protocolo,
        paraStatusPublico: statusExibidoDe(linha.paraStatus),
        reaberta: ehReabertura(linha.deStatus, linha.paraStatus),
        criadoEm: linha.criadoEm,
      })),
      proximoCursor:
        linhas.length > pedido.limite && ultima ? CursorAlertas.codificar(ultima.eventoId) : null,
    };
  }
}

/** O indicador do sino: quantos alertas chegaram desde a última visita à aba. */
@Injectable()
export class ContarAlertasNovos {
  constructor(@Inject(CONSULTAS_ALERTAS) private readonly consultas: ConsultasAlertas) {}

  executar(usuarioId: string): Promise<number> {
    return this.consultas.contarNovos(usuarioId);
  }
}

/** Abrir a aba zera o indicador. */
@Injectable()
export class MarcarAlertasVistos {
  constructor(@Inject(CONSULTAS_ALERTAS) private readonly consultas: ConsultasAlertas) {}

  executar(usuarioId: string, agora = new Date()): Promise<void> {
    return this.consultas.marcarVistos(usuarioId, agora);
  }
}

/** Quem deve ser avisado de um evento: os mesmos que o veem na aba Alertas. */
@Injectable()
export class DestinatariosDoEvento {
  constructor(@Inject(CONSULTAS_ALERTAS) private readonly consultas: ConsultasAlertas) {}

  executar(eventoId: number): Promise<string[]> {
    return this.consultas.destinatarios(eventoId);
  }
}
