import type { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

import { AMBIENTE, type Ambiente } from './shared/config/ambiente.js';
import { FiltroErros } from './shared/erros/filtro-erros.js';
import { criarPipeValidacao } from './shared/erros/validacao.js';

export const PREFIXO_API = 'api/v1';
export const CAMINHO_DOCS = 'docs';

/** Documento OpenAPI da API: servido em /docs-json e exportado para os contratos. */
export function criarDocumentoOpenApi(app: INestApplication, versao: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Fiscaliza Aí! API')
    .setVersion(versao)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/** Configuração compartilhada entre o servidor (main.ts) e os testes. */
export function configurarApp(app: NestFastifyApplication): void {
  const ambiente = app.get<Ambiente>(AMBIENTE);

  app.setGlobalPrefix(PREFIXO_API);
  app.useGlobalPipes(criarPipeValidacao());
  app.useGlobalFilters(new FiltroErros(app.get(HttpAdapterHost)));

  if (ambiente.SWAGGER_HABILITADO) {
    const documento = criarDocumentoOpenApi(app, ambiente.APP_VERSAO);
    // A UI fica em /docs e o JSON em /docs-json.
    SwaggerModule.setup(CAMINHO_DOCS, app, documento, { jsonDocumentUrl: `${CAMINHO_DOCS}-json` });
  }
}
