import { Inject, Injectable } from '@nestjs/common';

import {
  REPOSITORIO_SESSOES,
  REPOSITORIO_TOKENS_ACESSO,
  type RepositorioSessoes,
  type RepositorioTokensAcesso,
} from './portas.js';

export interface TokensApagados {
  sessoes: number;
  links: number;
}

/**
 * Apaga os refresh tokens e os links de senha e de convite expirados antes de `antesDe`. Com o
 * refresh token saem também o IP e o user-agent do login.
 */
@Injectable()
export class LimparTokensExpirados {
  constructor(
    @Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes,
    @Inject(REPOSITORIO_TOKENS_ACESSO) private readonly links: RepositorioTokensAcesso,
  ) {}

  async executar(antesDe: Date): Promise<TokensApagados> {
    return {
      sessoes: await this.sessoes.apagarExpiradosAntes(antesDe),
      links: await this.links.apagarExpiradosAntes(antesDe),
    };
  }
}
