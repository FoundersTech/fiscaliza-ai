import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { type RelatorioSaude, SaudeService } from './saude.service.js';

/** Só o necessário da resposta do Fastify, para não depender do pacote `fastify` aqui. */
interface RespostaComStatus {
  status(codigo: number): unknown;
}

@ApiTags('saude')
@Controller('health')
export class SaudeController {
  constructor(private readonly saude: SaudeService) {}

  @Get()
  @ApiOkResponse({ description: 'Banco e Redis respondendo.' })
  @ApiServiceUnavailableResponse({ description: 'Banco ou Redis fora do ar.' })
  async verificar(
    @Res({ passthrough: true }) resposta: RespostaComStatus,
  ): Promise<RelatorioSaude> {
    const relatorio = await this.saude.verificar();
    if (relatorio.status !== 'ok') {
      resposta.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return relatorio;
  }
}
