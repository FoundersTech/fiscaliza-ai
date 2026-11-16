import { Logger } from '@nestjs/common';
import { sendNotification } from 'web-push';

import type { Ambiente } from '../../../shared/config/ambiente.js';
import type {
  DestinoPush,
  MensagemPush,
  PushPort,
  ResultadoPush,
} from '../application/push.port.js';

const TIMEOUT_MS = 10_000;
/** Quanto tempo o serviço de push guarda a mensagem se o aparelho estiver desligado. */
const VALIDADE_S = 7 * 24 * 60 * 60;
/** O navegador desfez a inscrição ou ela expirou: não adianta mandar de novo. */
const STATUS_EXPIRADA = new Set([404, 410]);

export interface ConfigVapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** Envio pelo protocolo Web Push, assinado com as chaves VAPID. Sem chaves, não envia nada. */
export class WebPushAdapter implements PushPort {
  private readonly logger = new Logger(WebPushAdapter.name);

  constructor(private readonly vapid: ConfigVapid | null) {}

  async enviar(destino: DestinoPush, mensagem: MensagemPush): Promise<ResultadoPush> {
    if (!this.vapid) {
      this.logger.warn('Push não enviado: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas');
      return 'DESLIGADO';
    }

    try {
      await sendNotification(
        { endpoint: destino.endpoint, keys: { p256dh: destino.p256dh, auth: destino.auth } },
        JSON.stringify(mensagem),
        { vapidDetails: this.vapid, TTL: VALIDADE_S, timeout: TIMEOUT_MS },
      );
      return 'ENVIADO';
    } catch (erro) {
      const status = statusDaResposta(erro);
      if (status !== null && STATUS_EXPIRADA.has(status)) return 'INSCRICAO_EXPIRADA';
      // Só o status: a mensagem do erro traz o endpoint da inscrição.
      throw new Error(
        status === null
          ? `Falha ao chamar o serviço de push (${nomeDoErro(erro)})`
          : `Serviço de push respondeu ${status}`,
        { cause: erro },
      );
    }
  }
}

/** O status HTTP de um WebPushError; null quando a falha foi antes da resposta. */
function statusDaResposta(erro: unknown): number | null {
  if (
    typeof erro === 'object' &&
    erro !== null &&
    'statusCode' in erro &&
    typeof erro.statusCode === 'number'
  ) {
    return erro.statusCode;
  }
  return null;
}

function nomeDoErro(erro: unknown): string {
  if (erro instanceof Error) {
    const codigo = (erro as { code?: unknown }).code;
    return typeof codigo === 'string' ? `${erro.name} ${codigo}` : erro.name;
  }
  return 'erro desconhecido';
}

export function criarPushPort(ambiente: Ambiente): PushPort {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = ambiente;
  return new WebPushAdapter(
    publicKey && privateKey ? { publicKey, privateKey, subject: ambiente.VAPID_SUBJECT } : null,
  );
}
