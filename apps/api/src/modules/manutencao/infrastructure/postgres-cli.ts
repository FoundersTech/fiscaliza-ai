import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

/**
 * O pg_dump e o pg_restore da imagem da API (pacote postgresql-client-16), chamados com a
 * DATABASE_URL. O comando pode ganhar um prefixo, como `docker compose exec -T postgres`, para
 * rodar onde o binário não está instalado.
 */
export type ComandoPostgres = readonly [string, ...string[]];

/**
 * A libpq recusa parâmetros que ela não conhece na URL, como o `schema` do Prisma. Os outros
 * (sslmode, por exemplo) continuam.
 */
export function urlParaLibpq(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.href;
}

const LIMITE_STDERR = 4000;

/** Roda o comando com a entrada e a saída padrão ligadas a arquivos. Lança erro se falhar. */
export async function rodar(
  comando: ComandoPostgres,
  argumentos: readonly string[],
  arquivos: { entrada?: string; saida?: string },
): Promise<void> {
  const entrada = arquivos.entrada ? await open(arquivos.entrada, 'r') : undefined;
  const saida = arquivos.saida ? await open(arquivos.saida, 'w') : undefined;
  const [executavel, ...prefixo] = comando;
  // O binário é sempre o último item do comando.
  const nome = comando[comando.length - 1];
  try {
    await new Promise<void>((resolver, rejeitar) => {
      const processo = spawn(executavel, [...prefixo, ...argumentos], {
        stdio: [entrada?.fd ?? 'ignore', saida?.fd ?? 'ignore', 'pipe'],
      });
      let stderr = '';
      processo.stderr?.setEncoding('utf8');
      processo.stderr?.on('data', (parte: string) => {
        if (stderr.length < LIMITE_STDERR) stderr += parte;
      });
      processo.on('error', (erro) => {
        rejeitar(new Error(`Não deu para rodar o ${nome}: ${erro.message}`));
      });
      processo.on('close', (codigo) => {
        if (codigo === 0) resolver();
        else rejeitar(new Error(`${nome} terminou com código ${codigo}: ${stderr.trim()}`));
      });
    });
  } finally {
    await entrada?.close();
    await saida?.close();
  }
}
