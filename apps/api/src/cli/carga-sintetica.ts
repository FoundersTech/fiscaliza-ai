/**
 * Banco sintético para o teste de carga (passo a passo em apps/api/carga/README.md).
 *
 * Com DATABASE_URL apontando para um banco cujo nome começa com fiscaliza_carga:
 *   node dist/cli/carga-sintetica.js gerar [quantidade]   recria o banco (padrão: 200 mil ocorrências)
 *   node dist/cli/carga-sintetica.js apagar               apaga o banco sintético
 */
import { existsSync } from 'node:fs';

import { ErroBancoCarga, lerBancoCarga, lerQuantidade } from './carga/banco-carga.js';
import { apagarBancoCarga, gerarCarga } from './carga/gerar-carga.js';

async function principal(): Promise<void> {
  // O .env aponta para o banco de desenvolvimento; o DATABASE_URL passado no comando vence.
  const urlDoComando = process.env['DATABASE_URL'];
  if (existsSync('.env')) process.loadEnvFile('.env');
  const banco = lerBancoCarga(urlDoComando ?? process.env['DATABASE_URL']);

  const [comando, quantidade] = process.argv.slice(2);
  if (comando === 'gerar') {
    const total = lerQuantidade(quantidade);
    console.log(`Gerando ${total} ocorrências sintéticas no banco ${banco.nome}...`);
    const inicio = performance.now();
    const resumo = await gerarCarga(banco, total);
    const segundos = ((performance.now() - inicio) / 1000).toFixed(0);
    console.log(
      `Pronto em ${segundos} s: ${resumo.ocorrencias} ocorrências, ${resumo.eventos} eventos, ` +
        `${resumo.fotos} fotos e ${resumo.confirmacoes} confirmações.`,
    );
  } else if (comando === 'apagar') {
    await apagarBancoCarga(banco);
    console.log(`Banco ${banco.nome} apagado.`);
  } else {
    throw new ErroBancoCarga('Use: carga-sintetica.js gerar [quantidade] | apagar');
  }
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof ErroBancoCarga ? erro.message : erro);
  process.exit(1);
});
