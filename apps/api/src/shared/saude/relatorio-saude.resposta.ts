import { ApiProperty } from '@nestjs/swagger';

import type { EstadoComponente, RelatorioSaude } from './saude.service.js';

const ESTADOS: EstadoComponente[] = ['ok', 'erro'];

/** Formato da resposta do GET /health no OpenAPI (e nos contratos do PWA). */
export class RelatorioSaudeResposta implements RelatorioSaude {
  @ApiProperty({ enum: ESTADOS, description: 'ok quando banco e Redis respondem' })
  status!: EstadoComponente;

  @ApiProperty({ example: 'abc1234', description: 'Versão (commit) em execução' })
  versao!: string;

  @ApiProperty({ enum: ESTADOS })
  db!: EstadoComponente;

  @ApiProperty({ enum: ESTADOS })
  redis!: EstadoComponente;
}
