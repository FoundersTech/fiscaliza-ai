import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { RelatorioSaudeResposta } from './relatorio-saude.resposta.js';
import { SaudeService } from './saude.service.js';

/** Só o necessário da resposta do Fastify, para não depender do pacote `fastify` aqui. */
interface RespostaComStatus {
  status(codigo: number): unknown;
}

@ApiTags('saude')
@Controller('health')
export class SaudeController {
  constructor(private readonly saude: SaudeService) {}

  @Get()
  @ApiOkResponse({ type: RelatorioSaudeResposta, description: 'Banco e Redis respondendo.' })
  @ApiServiceUnavailableResponse({
    type: RelatorioSaudeResposta,
    description: 'Banco ou Redis fora do ar.',
  })
  async verificar(
    @Res({ passthrough: true }) resposta: RespostaComStatus,
  ): Promise<RelatorioSaudeResposta> {
    const relatorio = await this.saude.verificar();
    if (relatorio.status !== 'ok') {
      resposta.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return relatorio;
  }
}
