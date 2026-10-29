/**
 * Carga inicial do banco (T-07): Sorocaba, o órgão do município e as categorias.
 * Pode rodar em qualquer ambiente e mais de uma vez, sem duplicar nada.
 *
 * Uso: pnpm db:seed (na raiz do monorepo).
 */
import { aplicarCargaInicial } from './seed/carga-inicial.js';
import { executarComPrisma } from './seed/prisma-cli.js';

executarComPrisma(async (prisma) => {
  const resumo = await aplicarCargaInicial(prisma);
  console.log(
    `Carga inicial aplicada: município ${resumo.municipioId}, órgão ${resumo.orgaoId}, ` +
      `${resumo.categorias} categorias.`,
  );
}).catch((erro: unknown) => {
  console.error(erro);
  process.exit(1);
});
