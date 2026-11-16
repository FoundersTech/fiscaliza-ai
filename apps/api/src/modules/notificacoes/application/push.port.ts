export const PUSH_PORT = Symbol('PUSH_PORT');

/** O que o navegador devolve em `pushManager.subscribe()`. */
export interface DestinoPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** O JSON que o service worker recebe e mostra na notificação. */
export interface MensagemPush {
  titulo: string;
  corpo: string;
  /** Caminho do PWA que o toque na notificação abre. */
  url: string;
}

/**
 * - `ENVIADO`: o serviço de push aceitou a mensagem;
 * - `INSCRICAO_EXPIRADA`: o serviço respondeu 404 ou 410, a inscrição não vale mais e pode ser
 *   apagada;
 * - `DESLIGADO`: a API está sem chaves VAPID e não enviou nada.
 */
export type ResultadoPush = 'ENVIADO' | 'INSCRICAO_EXPIRADA' | 'DESLIGADO';

/** Envio de Web Push. Falhas que podem passar ao repetir (rede, 429, 5xx) lançam erro. */
export interface PushPort {
  enviar(destino: DestinoPush, mensagem: MensagemPush): Promise<ResultadoPush>;
}
