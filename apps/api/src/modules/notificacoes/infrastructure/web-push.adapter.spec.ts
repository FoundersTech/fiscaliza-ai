import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendNotification } = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock('web-push', () => ({ sendNotification }));

import { WebPushAdapter } from './web-push.adapter.js';

const DESTINO = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/segredo-endpoint',
  p256dh: 'chave-p256dh',
  auth: 'chave-auth',
};

const MENSAGEM = {
  titulo: 'Ocorrência FA-2026-SOR-000001',
  corpo: 'Está em andamento na prefeitura.',
  url: '/ocorrencias/123',
};

describe('WebPushAdapter', () => {
  beforeEach(() => {
    sendNotification.mockReset();
  });

  it('sem chaves VAPID configuradas, não chama web-push e devolve DESLIGADO', async () => {
    const adapter = new WebPushAdapter(null);
    await expect(adapter.enviar(DESTINO, MENSAGEM)).resolves.toBe('DESLIGADO');
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('envia o JSON assinado com as chaves VAPID', async () => {
    sendNotification.mockResolvedValue({});
    const adapter = new WebPushAdapter({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:contato@fiscalizaai.app',
    });

    await expect(adapter.enviar(DESTINO, MENSAGEM)).resolves.toBe('ENVIADO');
    expect(sendNotification).toHaveBeenCalledWith(
      {
        endpoint: DESTINO.endpoint,
        keys: { p256dh: DESTINO.p256dh, auth: DESTINO.auth },
      },
      JSON.stringify(MENSAGEM),
      expect.objectContaining({
        vapidDetails: {
          publicKey: 'pub',
          privateKey: 'priv',
          subject: 'mailto:contato@fiscalizaai.app',
        },
      }),
    );
  });

  it.each([404, 410])('resposta %i devolve INSCRICAO_EXPIRADA sem lançar', async (statusCode) => {
    sendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode }));
    const adapter = new WebPushAdapter({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:contato@fiscalizaai.app',
    });

    await expect(adapter.enviar(DESTINO, MENSAGEM)).resolves.toBe('INSCRICAO_EXPIRADA');
  });

  it('outra resposta HTTP lança erro sem vazar o endpoint da inscrição', async () => {
    sendNotification.mockRejectedValue(
      Object.assign(new Error(`Falha ao chamar ${DESTINO.endpoint}`), { statusCode: 503 }),
    );
    const adapter = new WebPushAdapter({
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:contato@fiscalizaai.app',
    });

    await expect(adapter.enviar(DESTINO, MENSAGEM)).rejects.toThrow(
      'Serviço de push respondeu 503',
    );
    await expect(adapter.enviar(DESTINO, MENSAGEM)).rejects.not.toThrow('segredo-endpoint');
  });
});
