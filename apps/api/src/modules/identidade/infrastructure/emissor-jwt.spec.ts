import { decodeJwt, SignJWT, UnsecuredJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DadosToken } from '../application/portas.js';
import { EmissorJwt } from './emissor-jwt.js';

const SEGREDO = 'x'.repeat(48);
const emissor = new EmissorJwt(SEGREDO);

const AGENTE: DadosToken = {
  usuarioId: '7b1f3c2e-4d5a-4b6c-8d9e-0f1a2b3c4d5e',
  papel: 'AGENTE_ORGAO',
  municipioId: 3552205,
  orgaoId: 1,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('EmissorJwt', () => {
  it('emite um token que volta com os mesmos dados', async () => {
    expect(await emissor.verificar(await emissor.emitir(AGENTE))).toEqual(AGENTE);
  });

  it('o token tem sub, papel, mun e org, e vale 15 minutos', async () => {
    const claims = decodeJwt(await emissor.emitir(AGENTE));

    expect(claims).toMatchObject({
      sub: AGENTE.usuarioId,
      papel: 'AGENTE_ORGAO',
      mun: 3552205,
      org: 1,
    });
    expect(claims.exp! - claims.iat!).toBe(15 * 60);
  });

  it('aceita município e órgão nulos (cidadão)', async () => {
    const cidadao: DadosToken = { ...AGENTE, papel: 'CIDADAO', municipioId: null, orgaoId: null };
    expect(await emissor.verificar(await emissor.emitir(cidadao))).toEqual(cidadao);
  });

  it('recusa token expirado', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-30T12:00:00Z') });
    const token = await emissor.emitir(AGENTE);

    vi.setSystemTime(new Date('2026-10-30T12:16:00Z'));
    expect(await emissor.verificar(token)).toBeNull();
  });

  it('recusa token assinado com outro segredo ou adulterado', async () => {
    const deOutro = await new EmissorJwt('y'.repeat(48)).emitir(AGENTE);
    expect(await emissor.verificar(deOutro)).toBeNull();

    const [cabecalho, , assinatura] = (await emissor.emitir(AGENTE)).split('.');
    const corpoForjado = Buffer.from(
      JSON.stringify({ ...decodeJwt(deOutro), papel: 'ADMIN_PLATAFORMA' }),
    ).toString('base64url');
    expect(await emissor.verificar(`${cabecalho}.${corpoForjado}.${assinatura}`)).toBeNull();
  });

  it('recusa token sem assinatura (alg none)', async () => {
    const semAssinatura = new UnsecuredJWT({ papel: 'ADMIN_PLATAFORMA', mun: null, org: null })
      .setSubject(AGENTE.usuarioId)
      .setExpirationTime('15m')
      .encode();
    expect(await emissor.verificar(semAssinatura)).toBeNull();
  });

  it('recusa token válido com papel desconhecido', async () => {
    const token = await new SignJWT({ papel: 'SUPERUSUARIO', mun: null, org: null })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(AGENTE.usuarioId)
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(SEGREDO));
    expect(await emissor.verificar(token)).toBeNull();
  });

  it('recusa lixo', async () => {
    for (const token of ['', 'abc', 'a.b.c']) {
      expect(await emissor.verificar(token)).toBeNull();
    }
  });
});
