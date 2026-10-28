import { type ArgumentsHost, Catch, type ExceptionFilter, Logger } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';

import { traduzirErro } from './traduzir-erro.js';

/** Filtro global: toda resposta de erro sai no formato { codigo, mensagem, detalhes }. */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErros.name);

  constructor(private readonly adaptador: HttpAdapterHost) {}

  catch(excecao: unknown, host: ArgumentsHost): void {
    const { status, corpo } = traduzirErro(excecao);

    if (status >= 500) {
      this.logger.error(excecao);
    }

    const { httpAdapter } = this.adaptador;
    httpAdapter.reply(host.switchToHttp().getResponse(), corpo, status);
  }
}
