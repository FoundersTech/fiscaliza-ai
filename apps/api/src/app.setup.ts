import { HttpAdapterHost } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AMBIENTE, type Ambiente } from './shared/config/ambiente.js';
import { FiltroErros } from './shared/erros/filtro-erros.js';
import { criarPipeValidacao } from './shared/erros/validacao.js';

export const PREFIXO_API = 'api/v1';
export const CAMINHO_DOCS = 'docs';

/** Configuração compartilhada entre o servidor (main.ts) e os testes. */
export function configurarApp(app: NestFastifyApplication): void {
  const ambiente = app.get<Ambiente>(AMBIENTE);

  app.setGlobalPrefix(PREFIXO_API);
  app.useGlobalPipes(criarPipeValidacao());
  app.useGlobalFilters(new FiltroErros(app.get(HttpAdapterHost)));

  if (ambiente.SWAGGER_HABILITADO) {
    const config = new DocumentBuilder()
      .setTitle('Fiscaliza Aí! API')
      .setVersion(ambiente.APP_VERSAO)
      .addBearerAuth()
      .build();
    const documento = SwaggerModule.createDocument(app, config);
    // A UI fica em /docs e o JSON em /docs-json (usado para gerar os contratos na T-03).
    SwaggerModule.setup(CAMINHO_DOCS, app, documento, { jsonDocumentUrl: `${CAMINHO_DOCS}-json` });
  }
}
