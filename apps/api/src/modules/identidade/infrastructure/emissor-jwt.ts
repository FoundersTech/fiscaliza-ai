import { jwtVerify, SignJWT } from 'jose';

import type { DadosToken, EmissorToken } from '../application/portas.js';
import { PAPEIS, type Papel } from '../domain/papel.js';

const ALGORITMO = 'HS256';
const DURACAO = '15m';

/** Token de acesso JWT HS256 de 15 minutos, com `sub`, `papel`, `mun` e `org`. */
export class EmissorJwt implements EmissorToken {
  private readonly chave: Uint8Array;

  constructor(segredo: string) {
    this.chave = new TextEncoder().encode(segredo);
  }

  emitir({ usuarioId, papel, municipioId, orgaoId }: DadosToken): Promise<string> {
    return new SignJWT({ papel, mun: municipioId, org: orgaoId })
      .setProtectedHeader({ alg: ALGORITMO, typ: 'JWT' })
      .setSubject(usuarioId)
      .setIssuedAt()
      .setExpirationTime(DURACAO)
      .sign(this.chave);
  }

  async verificar(token: string): Promise<DadosToken | null> {
    try {
      // Só aceita HS256: um token com "alg: none" ou outro algoritmo é recusado.
      const { payload } = await jwtVerify(token, this.chave, { algorithms: [ALGORITMO] });
      const { sub, papel, mun, org } = payload;
      if (
        typeof sub !== 'string' ||
        !PAPEIS.includes(papel as Papel) ||
        !idOuNulo(mun) ||
        !idOuNulo(org)
      ) {
        return null;
      }
      return { usuarioId: sub, papel: papel as Papel, municipioId: mun, orgaoId: org };
    } catch {
      return null;
    }
  }
}

function idOuNulo(valor: unknown): valor is number | null {
  return valor === null || Number.isInteger(valor);
}
