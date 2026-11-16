import { describe, expect, it, vi } from 'vitest';

import type { Api } from './api';
import { MENSAGEM_SEM_CONEXAO } from './erros';
import {
  type AmbientePush,
  ativarPush,
  chaveVapidParaBytes,
  conviteDispensado,
  desativarPush,
  dispensarConvite,
  ehIosSemInstalar,
  estadoPush,
  type InscricaoPush,
} from './push';

function inscricaoFalsa(endpoint = 'https://push.exemplo.test/sub-1'): {
  inscricao: InscricaoPush;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const unsubscribe = vi.fn(() => Promise.resolve(true));
  return {
    inscricao: {
      toJSON: () => ({
        endpoint,
        keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
      }),
      unsubscribe,
    },
    unsubscribe,
  };
}

function ambienteFalso(
  opcoes: {
    permission?: NotificationPermission;
    requestPermission?: () => Promise<NotificationPermission>;
    inscricao?: InscricaoPush | null;
    novaInscricao?: InscricaoPush;
    pronto?: Promise<never>;
    temPushManager?: boolean;
    userAgent?: string;
    maxTouchPoints?: number;
    standalone?: boolean;
    displayStandalone?: boolean;
  } = {},
): {
  ambiente: AmbientePush;
  subscribe: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
} {
  const existente = opcoes.inscricao ?? null;
  const subscribe = vi.fn(() =>
    Promise.resolve(opcoes.novaInscricao ?? existente ?? inscricaoFalsa().inscricao),
  );
  const registro = {
    pushManager: {
      getSubscription: vi.fn(() => Promise.resolve(existente)),
      subscribe,
    },
  };
  const requestPermission = vi.fn(
    opcoes.requestPermission ?? (() => Promise.resolve(opcoes.permission ?? 'granted')),
  );

  const ambiente: AmbientePush = {
    temPushManager: opcoes.temPushManager ?? true,
    userAgent: opcoes.userAgent ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0',
    ...(opcoes.maxTouchPoints !== undefined && { maxTouchPoints: opcoes.maxTouchPoints }),
    ...(opcoes.standalone !== undefined && { standalone: opcoes.standalone }),
    matchMedia: () => ({ matches: opcoes.displayStandalone ?? false }),
    notificacao: {
      permission: opcoes.permission ?? 'default',
      requestPermission,
    },
    serviceWorker: {
      ready: opcoes.pronto ?? Promise.resolve(registro),
      getRegistration: () => Promise.resolve(registro),
    },
  };

  return { ambiente, subscribe, requestPermission };
}

describe('chaveVapidParaBytes', () => {
  it('converte base64url sem preenchimento em Uint8Array', () => {
    const bytes = chaveVapidParaBytes('SGVsbG8td29ybGQ_');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111, 45, 119, 111, 114, 108, 100, 63]);
  });
});

describe('ehIosSemInstalar e estadoPush', () => {
  it('identifica iPhone e iPad fora da Tela de Início antes de checar PushManager', async () => {
    const iphoneNavegador = ambienteFalso({
      temPushManager: false,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      standalone: false,
    }).ambiente;
    expect(ehIosSemInstalar(iphoneNavegador)).toBe(true);
    await expect(estadoPush('chave-vapid', iphoneNavegador)).resolves.toBe('INSTALAR_IOS');

    const ipadComoMac = ambienteFalso({
      temPushManager: false,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    }).ambiente;
    expect(ehIosSemInstalar(ipadComoMac)).toBe(true);

    const iphoneInstalado = ambienteFalso({
      temPushManager: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      standalone: true,
      permission: 'default',
    }).ambiente;
    expect(ehIosSemInstalar(iphoneInstalado)).toBe(false);
    await expect(estadoPush('chave-vapid', iphoneInstalado)).resolves.toBe('DISPONIVEL');
  });

  it('cobre NAO_SUPORTADO, INDISPONIVEL, BLOQUEADO, ATIVO e DISPONIVEL', async () => {
    await expect(
      estadoPush('chave', ambienteFalso({ temPushManager: false }).ambiente),
    ).resolves.toBe('NAO_SUPORTADO');
    await expect(estadoPush(null, ambienteFalso().ambiente)).resolves.toBe('INDISPONIVEL');
    await expect(
      estadoPush('chave', ambienteFalso({ permission: 'denied' }).ambiente),
    ).resolves.toBe('BLOQUEADO');
    await expect(
      estadoPush(
        'chave',
        ambienteFalso({ permission: 'granted', inscricao: inscricaoFalsa().inscricao }).ambiente,
      ),
    ).resolves.toBe('ATIVO');
    await expect(
      estadoPush('chave', ambienteFalso({ permission: 'granted', inscricao: null }).ambiente),
    ).resolves.toBe('DISPONIVEL');
  });
});

describe('ativarPush e desativarPush', () => {
  it('pede permissão, cria inscrição e envia POST /me/push', async () => {
    const POST = vi.fn(() => Promise.resolve({ response: { ok: true } }));
    const api = { POST } as unknown as Api;
    const { ambiente, subscribe } = ambienteFalso({ permission: 'granted' });

    const resultado = await ativarPush(api, 'SGVsbG8td29ybGQ_', ambiente);

    expect(resultado).toEqual({ tipo: 'ATIVADO' });
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    );
    expect(POST).toHaveBeenCalledWith('/api/v1/me/push', {
      body: {
        endpoint: 'https://push.exemplo.test/sub-1',
        keys: { p256dh: 'chave-p256dh', auth: 'chave-auth' },
      },
    });
  });

  it('se a API falhar ao gravar uma inscrição recém-criada, desfaz no navegador', async () => {
    const nova = inscricaoFalsa();
    const POST = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const api = { POST } as unknown as Api;
    const { ambiente } = ambienteFalso({ permission: 'granted', novaInscricao: nova.inscricao });

    const resultado = await ativarPush(api, 'SGVsbG8td29ybGQ_', ambiente);

    expect(resultado).toEqual({ tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO });
    expect(nova.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('trata permissão recusada, dispensada e timeout sem service worker', async () => {
    const api = { POST: vi.fn() } as unknown as Api;

    await expect(
      ativarPush(api, 'SGVsbG8', ambienteFalso({ permission: 'denied' }).ambiente),
    ).resolves.toMatchObject({ tipo: 'BLOQUEADO' });

    await expect(
      ativarPush(api, 'SGVsbG8', ambienteFalso({ permission: 'default' }).ambiente),
    ).resolves.toMatchObject({ tipo: 'RECUSADO' });

    const nuncaPronto = new Promise<never>(() => undefined);
    await expect(
      ativarPush(api, 'SGVsbG8', ambienteFalso({ pronto: nuncaPronto }).ambiente, 1),
    ).resolves.toMatchObject({ tipo: 'ERRO' });
  });

  it('desativarPush chama DELETE /me/push e remove a inscrição do navegador', async () => {
    const sub = inscricaoFalsa();
    const DELETE = vi.fn(() => Promise.resolve({ response: { ok: true } }));
    const api = { DELETE } as unknown as Api;
    const { ambiente } = ambienteFalso({ inscricao: sub.inscricao });

    const resultado = await desativarPush(api, ambiente);

    expect(resultado).toEqual({ tipo: 'DESATIVADO' });
    expect(DELETE).toHaveBeenCalledWith('/api/v1/me/push', {
      body: { endpoint: 'https://push.exemplo.test/sub-1' },
    });
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('dispensa do convite de push', () => {
  it('lembra a dispensa quando há armazenamento e não falha quando está bloqueado', () => {
    const dados = new Map<string, string>();
    const armazenamento = {
      getItem: (chave: string) => dados.get(chave) ?? null,
      setItem: (chave: string, valor: string) => {
        dados.set(chave, valor);
      },
    };
    expect(conviteDispensado(armazenamento)).toBe(false);
    dispensarConvite(armazenamento);
    expect(conviteDispensado(armazenamento)).toBe(true);

    const bloqueado = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(conviteDispensado(bloqueado)).toBe(false);
    expect(() => dispensarConvite(bloqueado)).not.toThrow();
  });
});
