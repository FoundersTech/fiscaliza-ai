import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DumpGerado, GeradorDump } from '../application/portas.js';
import { type ComandoPostgres, rodar, urlParaLibpq } from './postgres-cli.js';

/**
 * Cópia do banco no formato custom do pg_dump (comprimido, restaurado com pg_restore). Sem
 * dono nem permissões: a cópia sobe em qualquer banco vazio, com qualquer usuário.
 */
export class PgDump implements GeradorDump {
  constructor(
    private readonly databaseUrl: string,
    private readonly comando: ComandoPostgres = ['pg_dump'],
  ) {}

  async gerar(): Promise<DumpGerado> {
    const caminho = join(tmpdir(), `fiscaliza-${randomUUID()}.dump`);
    const descartar = () => rm(caminho, { force: true });
    try {
      await rodar(
        this.comando,
        ['--format=custom', '--no-owner', '--no-acl', `--dbname=${urlParaLibpq(this.databaseUrl)}`],
        { saida: caminho },
      );
      const { size } = await stat(caminho);
      return { caminho, bytes: size, descartar };
    } catch (erro) {
      await descartar();
      throw erro;
    }
  }
}

/**
 * Restaura uma cópia do pg_dump num banco vazio. Para no primeiro erro, para que uma restauração
 * pela metade não passe despercebida.
 */
export function restaurarDump(
  caminho: string,
  databaseUrl: string,
  comando: ComandoPostgres = ['pg_restore'],
): Promise<void> {
  return rodar(
    comando,
    ['--no-owner', '--no-acl', '--exit-on-error', `--dbname=${urlParaLibpq(databaseUrl)}`],
    { entrada: caminho },
  );
}
