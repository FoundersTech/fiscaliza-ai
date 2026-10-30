import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EmailArquivoAdapter } from './email-arquivo.adapter.js';

describe('EmailArquivoAdapter', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = join(await mkdtemp(join(tmpdir(), 'fa-emails-')), 'emails');
  });

  afterEach(async () => {
    await rm(join(pasta, '..'), { recursive: true, force: true });
  });

  it('cria a pasta e grava o .json e o .html de cada e-mail', async () => {
    const adapter = new EmailArquivoAdapter(pasta);
    const mensagem = { para: 'ana@exemplo.test', assunto: 'Oi', html: '<p>Oi</p>', texto: 'Oi' };

    await adapter.enviar(mensagem);
    await adapter.enviar({ ...mensagem, assunto: 'Outro' });

    const arquivos = (await readdir(pasta)).sort();
    expect(arquivos).toHaveLength(4);

    const json = arquivos.find((nome) => nome.endsWith('.json'))!;
    expect(JSON.parse(await readFile(join(pasta, json), 'utf8'))).toEqual(mensagem);
    const html = json.replace(/\.json$/, '.html');
    expect(await readFile(join(pasta, html), 'utf8')).toBe('<p>Oi</p>');
  });
});
