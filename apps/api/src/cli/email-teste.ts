/**
 * Envia um e-mail de redefinição de senha de exemplo pelo transporte configurado, sem passar
 * pela fila. Serve para conferir o Resend num ambiente com RESEND_API_KEY.
 *
 * Uso: pnpm email:teste -- --para voce@exemplo.com (na raiz do monorepo).
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { emailRedefinicaoSenha } from '../modules/notificacoes/application/templates-email.js';
import { criarEmailPort } from '../modules/notificacoes/infrastructure/criar-email-port.js';
import { validarAmbiente } from '../shared/config/ambiente.js';

async function principal(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const { values } = parseArgs({ options: { para: { type: 'string' } } });
  if (!values.para) {
    throw new Error('Informe o destinatário: --para voce@exemplo.com');
  }

  const ambiente = validarAmbiente(process.env);
  const link = `${ambiente.WEB_URL}/definir-senha?token=token-de-teste`;
  await criarEmailPort(ambiente).enviar({
    para: values.para,
    ...emailRedefinicaoSenha({ nome: 'Pessoa de Teste', link }),
  });

  console.log(`E-mail de teste enviado pelo transporte "${ambiente.EMAIL_TRANSPORTE}".`);
}

principal().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
