/**
 * O teste de carga roda num banco próprio, criado e apagado pelo script. Para nunca apagar o
 * banco de desenvolvimento, de teste ou de staging por engano, o nome precisa começar com
 * `fiscaliza_carga`.
 */
const NOME_BANCO_CARGA = /^fiscaliza_carga(_[a-z0-9]+)*$/;

export class ErroBancoCarga extends Error {}

export interface BancoCarga {
  /** Nome do banco sintético, já conferido. */
  nome: string;
  /** URL do banco sintético. */
  url: string;
  /** URL do banco `postgres` do mesmo servidor, de onde o sintético é criado e apagado. */
  urlManutencao: string;
}

export function lerBancoCarga(databaseUrl: string | undefined): BancoCarga {
  if (!databaseUrl) {
    throw new ErroBancoCarga('Defina DATABASE_URL apontando para o banco fiscaliza_carga.');
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new ErroBancoCarga('DATABASE_URL inválido.');
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    throw new ErroBancoCarga('DATABASE_URL precisa ser uma URL postgresql://.');
  }
  const nome = decodeURIComponent(url.pathname.slice(1));
  if (!NOME_BANCO_CARGA.test(nome)) {
    throw new ErroBancoCarga(
      `O banco "${nome}" não é de carga: o nome precisa começar com fiscaliza_carga ` +
        '(ex.: postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza_carga).',
    );
  }
  const manutencao = new URL(url.href);
  manutencao.pathname = '/postgres';
  return { nome, url: url.href, urlManutencao: manutencao.href };
}

export const QUANTIDADE_PADRAO = 200_000;

export function lerQuantidade(valor: string | undefined): number {
  if (valor === undefined) return QUANTIDADE_PADRAO;
  const quantidade = Number(valor);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 2_000_000) {
    throw new ErroBancoCarga('A quantidade deve ser um inteiro de 1 a 2.000.000.');
  }
  return quantidade;
}
