import { Global, Module } from '@nestjs/common';

import { AMBIENTE, type Ambiente, validarAmbiente } from './ambiente.js';
import { carregarParametros, PARAMETROS } from './parametros.js';

/**
 * Valida as variáveis de ambiente e o parametros.json na subida.
 * Qualquer erro aqui impede a API de subir.
 */
@Global()
@Module({
  providers: [
    { provide: AMBIENTE, useFactory: (): Ambiente => validarAmbiente(process.env) },
    {
      provide: PARAMETROS,
      inject: [AMBIENTE],
      useFactory: (ambiente: Ambiente) => carregarParametros(ambiente.PARAMETROS_CAMINHO),
    },
  ],
  exports: [AMBIENTE, PARAMETROS],
})
export class ConfiguracaoModule {}
