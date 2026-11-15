import { ApiProperty, PickType } from '@nestjs/swagger';

import { FeedQuery } from '../../ocorrencias/presentation/dto-consultas.js';
import {
  StatusDoAutor,
  type StatusExibido,
  StatusPublico,
} from '../../ocorrencias/domain/exibicao-publica.js';
import type { Alerta, PaginaAlertas } from '../application/alertas.js';

const STATUS_EXIBIDOS = [...Object.values(StatusPublico), ...Object.values(StatusDoAutor)];

export class AlertasQuery extends PickType(FeedQuery, ['cursor', 'limite'] as const) {}

export class AlertaResposta {
  @ApiProperty({ example: 42 })
  evento_id!: number;

  @ApiProperty({ format: 'uuid' })
  ocorrencia_id!: string;

  @ApiProperty({ example: 'FA-2026-SOR-000123' })
  protocolo!: string;

  @ApiProperty({
    enum: STATUS_EXIBIDOS,
    description: 'O status depois da mudança; RECUSADO e DUPLICADO só chegam para o autor',
  })
  para_status_publico!: StatusExibido;

  @ApiProperty({ description: 'A ocorrência foi reaberta: voltou de resolvida para em análise' })
  reaberta!: boolean;

  @ApiProperty({ format: 'date-time' })
  criado_em!: string;

  static de(alerta: Alerta): AlertaResposta {
    return {
      evento_id: alerta.eventoId,
      ocorrencia_id: alerta.ocorrenciaId,
      protocolo: alerta.protocolo,
      para_status_publico: alerta.paraStatusPublico,
      reaberta: alerta.reaberta,
      criado_em: alerta.criadoEm.toISOString(),
    };
  }
}

export class AlertasResposta {
  @ApiProperty({ type: [AlertaResposta] })
  itens!: AlertaResposta[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Passe em ?cursor= para a página seguinte; null na última',
  })
  proximo_cursor!: string | null;

  static de(pagina: PaginaAlertas): AlertasResposta {
    return {
      itens: pagina.itens.map((alerta) => AlertaResposta.de(alerta)),
      proximo_cursor: pagina.proximoCursor,
    };
  }
}

export class AlertasNovosResposta {
  @ApiProperty({ example: 2, description: 'Alertas desde a última visita à aba' })
  quantidade!: number;
}
