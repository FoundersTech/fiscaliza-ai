import { Inject, Injectable } from '@nestjs/common';

import {
  ARQUIVOS_EXPORTACAO,
  type ArquivosExportacao,
  REPOSITORIO_EXPORTACOES,
  type RepositorioExportacoes,
} from './portas.js';

const LOTE = 500;

/**
 * Exportações de dados pessoais cujo prazo de download passou: o arquivo sai do bucket e a
 * exportação fica EXPIRADA. Quando o módulo de privacidade existir, este caso de uso pode ir
 * para ele, como os outros que a limpeza chama.
 */
@Injectable()
export class ExpirarExportacoes {
  constructor(
    @Inject(REPOSITORIO_EXPORTACOES) private readonly exportacoes: RepositorioExportacoes,
    @Inject(ARQUIVOS_EXPORTACAO) private readonly arquivos: ArquivosExportacao,
  ) {}

  /** Devolve quantas expiraram. */
  async executar(agora: Date): Promise<number> {
    const vencidas = await this.exportacoes.vencidas(agora, LOTE);
    for (const { id, storageKey } of vencidas) {
      // O arquivo sai antes: se a remoção falhar, a exportação continua na lista da próxima vez.
      if (storageKey) await this.arquivos.apagar(storageKey);
      await this.exportacoes.marcarExpirada(id);
    }
    return vencidas.length;
  }
}
