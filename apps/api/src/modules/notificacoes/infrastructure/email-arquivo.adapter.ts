import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Logger } from '@nestjs/common';

import type { EmailPort, MensagemEmail } from '../application/email.port.js';

/**
 * Transporte de desenvolvimento e testes: grava cada e-mail em vez de enviá-lo.
 * O `.html` abre no navegador (com o link clicável); o `.json` serve para os testes lerem.
 */
export class EmailArquivoAdapter implements EmailPort {
  private readonly logger = new Logger(EmailArquivoAdapter.name);
  readonly pasta: string;

  constructor(pasta: string) {
    this.pasta = resolve(process.cwd(), pasta);
  }

  async enviar(mensagem: MensagemEmail): Promise<void> {
    await mkdir(this.pasta, { recursive: true });

    const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
    const base = join(this.pasta, `${carimbo}-${randomUUID().slice(0, 8)}`);
    await writeFile(`${base}.json`, JSON.stringify(mensagem, null, 2), 'utf8');
    await writeFile(`${base}.html`, mensagem.html, 'utf8');

    this.logger.log(`E-mail "${mensagem.assunto}" gravado em ${base}.html`);
  }
}
