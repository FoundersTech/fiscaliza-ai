import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErroEmailPermanente, type MensagemEmail } from '../application/email.port.js';
import { EmailResendAdapter } from './email-resend.adapter.js';

const MENSAGEM: MensagemEmail = {
  para: 'ana@exemplo.test',
  assunto: 'Assunto',
  html: '<p>Oi</p>',
  texto: 'Oi',
};

const adapter = new EmailResendAdapter({
  chave: 're_teste',
  remetente: 'Fiscaliza Aí! <nao-responda@fiscalizaai.app>',
});

function responder(status: number, corpo: unknown = { id: 'email-1' }) {
  const fetchFalso = vi.fn<typeof fetch>().mockResolvedValue(Response.json(corpo, { status }));
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmailResendAdapter', () => {
  it('envia para a API do Resend com a chave, o remetente e a chave de idempotência', async () => {
    const fetchFalso = responder(200);

    await adapter.enviar(MENSAGEM, { chaveIdempotencia: 'email-42' });

    const [url, requisicao] = fetchFalso.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(requisicao).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_teste',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'email-42',
      },
    });
    expect(JSON.parse(requisicao!.body as string)).toEqual({
      from: 'Fiscaliza Aí! <nao-responda@fiscalizaai.app>',
      to: ['ana@exemplo.test'],
      subject: 'Assunto',
      html: '<p>Oi</p>',
      text: 'Oi',
    });
  });

  it.each([429, 500, 503])(
    'resposta %s lança erro comum, para a fila tentar de novo',
    async (status) => {
      responder(status, { name: 'rate_limit_exceeded' });

      const erro = await adapter.enviar(MENSAGEM).catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(Error);
      expect(erro).not.toBeInstanceOf(ErroEmailPermanente);
    },
  );

  it.each([401, 403, 422])('resposta %s é falha permanente', async (status) => {
    responder(status, { name: 'validation_error', message: 'ana@exemplo.test é inválido' });

    const erro = await adapter.enviar(MENSAGEM).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroEmailPermanente);
    expect((erro as Error).message).toBe(`Resend respondeu ${status} (validation_error)`);
    // A mensagem do provedor fica de fora: ela pode repetir o endereço.
    expect((erro as Error).message).not.toContain('ana@exemplo.test');
  });

  it('erro de rede passa adiante, para a fila tentar de novo', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed')));

    await expect(adapter.enviar(MENSAGEM)).rejects.toThrow('fetch failed');
  });
});
