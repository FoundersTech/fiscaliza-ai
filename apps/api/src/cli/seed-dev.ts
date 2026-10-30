/**
 * Dados de desenvolvimento: carga inicial, 1 usuário por papel e 50 ocorrências.
 * Recusa rodar fora de NODE_ENV=development ou test.
 *
 * Uso: pnpm db:seed:dev (na raiz do monorepo).
 */
import { aplicarDadosDev, ErroAmbienteSeedDev } from './seed/dados-dev.js';
import { executarComPrisma } from './seed/prisma-cli.js';

executarComPrisma(async (prisma) => {
  const resumo = await aplicarDadosDev(prisma, process.env['NODE_ENV']);
  console.log(
    resumo.ocorrenciasCriadas > 0
      ? `Dados de desenvolvimento criados: ${resumo.usuarios} usuários e ${resumo.ocorrenciasCriadas} ocorrências.`
      : `Dados de desenvolvimento já existiam: ${resumo.usuarios} usuários conferidos, nenhuma ocorrência nova.`,
  );
}).catch((erro: unknown) => {
  console.error(erro instanceof ErroAmbienteSeedDev ? erro.message : erro);
  process.exit(1);
});
