import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';

/** Monta o endereço público de uma foto já publicada a partir da chave gravada no banco. */
@Injectable()
export class UrlFotos {
  private readonly base: string;

  constructor(@Inject(AMBIENTE) ambiente: Ambiente) {
    this.base = ambiente.R2_URL_PUBLICA;
  }

  publica(chave: string): string {
    return `${this.base}/${chave.split('/').map(encodeURIComponent).join('/')}`;
  }
}
