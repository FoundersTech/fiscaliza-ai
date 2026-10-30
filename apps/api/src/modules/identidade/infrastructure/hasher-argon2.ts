import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { HasherSenha } from '../application/portas.js';

const gerarArgon2 = promisify(argon2);

/** Parâmetros mínimos recomendados pela OWASP para argon2id: 19 MiB, 2 passadas, 1 thread. */
const MEMORIA_KIB = 19_456;
const PASSADAS = 2;
const PARALELISMO = 1;
const TAMANHO_SAL = 16;
const TAMANHO_HASH = 32;

/** Formato PHC, o mesmo das bibliotecas de argon2: $argon2id$v=19$m=..,t=..,p=..$sal$hash. */
const FORMATO = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/** argon2id nativo do Node, sem dependência compilada. */
export class HasherArgon2 implements HasherSenha {
  async gerar(senha: string): Promise<string> {
    const sal = randomBytes(TAMANHO_SAL);
    const hash = await this.calcular(senha, sal, MEMORIA_KIB, PASSADAS, PARALELISMO, TAMANHO_HASH);
    return `$argon2id$v=19$m=${MEMORIA_KIB},t=${PASSADAS},p=${PARALELISMO}$${base64(sal)}$${base64(hash)}`;
  }

  /** Usa os parâmetros gravados no hash: senhas antigas continuam valendo se eles mudarem. */
  async conferir(hashGravado: string, senha: string): Promise<boolean> {
    const partes = FORMATO.exec(hashGravado);
    if (!partes) return false;

    const [, memoria, passadas, paralelismo, sal, hash] = partes;
    const esperado = Buffer.from(hash!, 'base64');
    const calculado = await this.calcular(
      senha,
      Buffer.from(sal!, 'base64'),
      Number(memoria),
      Number(passadas),
      Number(paralelismo),
      esperado.length,
    );
    return timingSafeEqual(calculado, esperado);
  }

  private calcular(
    senha: string,
    sal: Buffer,
    memoria: number,
    passadas: number,
    paralelismo: number,
    tamanho: number,
  ): Promise<Buffer> {
    return gerarArgon2('argon2id', {
      message: senha,
      nonce: sal,
      memory: memoria,
      passes: passadas,
      parallelism: paralelismo,
      tagLength: tamanho,
    });
  }
}

/** Base64 sem o preenchimento "=", como no formato PHC. */
function base64(dados: Buffer): string {
  return dados.toString('base64').replace(/=+$/, '');
}
