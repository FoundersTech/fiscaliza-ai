import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes aleatórios, para o cookie de refresh e para os links enviados por e-mail. */
export function gerarSegredo(): string {
  return randomBytes(32).toString('base64url');
}

/** O banco guarda só o SHA-256: quem lê a tabela não consegue usar o segredo. */
export function resumirSegredo(segredo: string): string {
  return createHash('sha256').update(segredo).digest('hex');
}
