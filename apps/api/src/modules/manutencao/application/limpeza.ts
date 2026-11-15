import { Injectable, Logger } from '@nestjs/common';

import { LimparTokensExpirados } from '../../identidade/application/limpar-tokens-expirados.js';
import { LimparUploadsOrfaos } from '../../midia/application/limpar-uploads-orfaos.js';
import { ExpirarExportacoes } from './expirar-exportacoes.js';

/** Job `limpeza`, todo dia às 03:00 de São Paulo. */
export const JOB_LIMPEZA = 'limpeza';
export const AGENDA_LIMPEZA = '0 3 * * *';

/** Um original sem ocorrência há mais que isso não vai mais ser usado. */
const IDADE_UPLOAD_ORFAO_MS = 24 * 60 * 60_000;
/** Tokens expirados ficam esse tempo (com IP e user-agent) antes de sair. */
const RETENCAO_TOKENS_MS = 30 * 24 * 60 * 60_000;

export interface ResultadoLimpeza {
  uploads: number;
  sessoes: number;
  links: number;
  exportacoes: number;
}

@Injectable()
export class Limpeza {
  private readonly logger = new Logger(Limpeza.name);

  constructor(
    private readonly uploads: LimparUploadsOrfaos,
    private readonly tokens: LimparTokensExpirados,
    private readonly exportacoes: ExpirarExportacoes,
  ) {}

  async executar(agora = new Date()): Promise<ResultadoLimpeza> {
    const uploads = await this.uploads.executar(new Date(agora.getTime() - IDADE_UPLOAD_ORFAO_MS));
    const { sessoes, links } = await this.tokens.executar(
      new Date(agora.getTime() - RETENCAO_TOKENS_MS),
    );
    const exportacoes = await this.exportacoes.executar(agora);
    this.logger.log(
      `Limpeza: ${uploads} uploads órfãos, ${sessoes} sessões e ${links} links expirados ` +
        `e ${exportacoes} exportações vencidas`,
    );
    return { uploads, sessoes, links, exportacoes };
  }
}
