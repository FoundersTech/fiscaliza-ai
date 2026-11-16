import type { Api } from './api';
import { lerErroApi, MENSAGEM_SEM_CONEXAO, mensagemDoErro } from './erros';
import type { Armazenamento } from './tema';

/**
 * O convite de notificações na aba Alertas:
 * - NAO_SUPORTADO: o navegador não tem push;
 * - INSTALAR_IOS: iPhone/iPad fora da Tela de Início, onde o Safari não entrega push;
 * - INDISPONIVEL: o servidor está sem chave de push configurada;
 * - BLOQUEADO: a pessoa bloqueou as notificações no navegador;
 * - ATIVO: este aparelho já está inscrito;
 * - DISPONIVEL: dá para ativar.
 */
export type EstadoPush =
  'NAO_SUPORTADO' | 'INSTALAR_IOS' | 'INDISPONIVEL' | 'BLOQUEADO' | 'ATIVO' | 'DISPONIVEL';

/** Só o que o push usa da inscrição do navegador, para os testes passarem uma falsa. */
export interface InscricaoPush {
  toJSON(): PushSubscriptionJSON;
  unsubscribe(): Promise<boolean>;
}

export interface GerenciadorPush {
  getSubscription(): Promise<InscricaoPush | null>;
  subscribe(opcoes: PushSubscriptionOptionsInit): Promise<InscricaoPush>;
}

export interface RegistroPush {
  pushManager: GerenciadorPush;
}

export interface TrabalhadorPush {
  ready: Promise<RegistroPush>;
  getRegistration(): Promise<RegistroPush | undefined>;
}

export interface NotificacaoPush {
  readonly permission: NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
}

/** O que o push usa do navegador. */
export interface AmbientePush {
  notificacao?: NotificacaoPush;
  serviceWorker?: TrabalhadorPush;
  /** `PushManager` existe no navegador. */
  temPushManager: boolean;
  userAgent: string;
  /** O iPadOS se apresenta como Mac; o toque denuncia que é um iPad. */
  maxTouchPoints?: number;
  matchMedia?: (consulta: string) => { matches: boolean };
  /** `navigator.standalone`, só do Safari no iOS. */
  standalone?: boolean;
}

export function ambienteDoNavegador(): AmbientePush {
  const navegador = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined;
  const ambiente: AmbientePush = {
    temPushManager: 'PushManager' in globalThis,
    userAgent: navegador?.userAgent ?? '',
  };
  if (typeof globalThis.Notification === 'function') ambiente.notificacao = globalThis.Notification;
  if (navegador?.serviceWorker) ambiente.serviceWorker = navegador.serviceWorker;
  if (navegador?.maxTouchPoints !== undefined) ambiente.maxTouchPoints = navegador.maxTouchPoints;
  if (typeof globalThis.matchMedia === 'function') {
    ambiente.matchMedia = (consulta) => globalThis.matchMedia(consulta);
  }
  if (navegador?.standalone !== undefined) ambiente.standalone = navegador.standalone;
  return ambiente;
}

/** A chave pública VAPID (base64 com `-` e `_`, sem `=`) nos bytes que o `subscribe` espera. */
export function chaveVapidParaBytes(chaveBase64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = chaveBase64Url.trim().replace(/-/g, '+').replace(/_/g, '/');
  const completa = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binario = atob(completa);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function ehAparelhoIos(ambiente: AmbientePush): boolean {
  if (/iPhone|iPad|iPod/i.test(ambiente.userAgent)) return true;
  return /Macintosh/i.test(ambiente.userAgent) && (ambiente.maxTouchPoints ?? 0) > 1;
}

function estaInstalado(ambiente: AmbientePush): boolean {
  if (ambiente.standalone === true) return true;
  try {
    return ambiente.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    return false;
  }
}

/** iPhone, iPad ou iPod aberto no navegador, fora do app instalado na Tela de Início. */
export function ehIosSemInstalar(ambiente: AmbientePush = ambienteDoNavegador()): boolean {
  return ehAparelhoIos(ambiente) && !estaInstalado(ambiente);
}

function suportaPush(
  ambiente: AmbientePush,
): ambiente is AmbientePush & { notificacao: NotificacaoPush; serviceWorker: TrabalhadorPush } {
  return Boolean(ambiente.notificacao && ambiente.serviceWorker && ambiente.temPushManager);
}

/** Inscrição deste aparelho; null sem service worker registrado ou se o navegador falhar. */
async function inscricaoAtual(serviceWorker: TrabalhadorPush): Promise<InscricaoPush | null> {
  try {
    const registro = await serviceWorker.getRegistration();
    return (await registro?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export async function estadoPush(
  vapidPublicKey: string | null | undefined,
  ambiente: AmbientePush = ambienteDoNavegador(),
): Promise<EstadoPush> {
  if (ehIosSemInstalar(ambiente)) return 'INSTALAR_IOS';
  if (!suportaPush(ambiente)) return 'NAO_SUPORTADO';
  if (!vapidPublicKey) return 'INDISPONIVEL';
  const permissao = ambiente.notificacao.permission;
  if (permissao === 'denied') return 'BLOQUEADO';
  if (permissao === 'granted' && (await inscricaoAtual(ambiente.serviceWorker))) return 'ATIVO';
  return 'DISPONIVEL';
}

export type ResultadoAtivarPush =
  | { tipo: 'ATIVADO' }
  | { tipo: 'BLOQUEADO'; mensagem: string }
  | { tipo: 'RECUSADO'; mensagem: string }
  | { tipo: 'ERRO'; mensagem: string };

const MENSAGEM_SEM_SUPORTE = 'Este navegador não recebe notificações.';
const MENSAGEM_BLOQUEADO =
  'As notificações estão bloqueadas. Libere nas configurações do navegador para receber avisos.';
const MENSAGEM_RECUSADO = 'Você não permitiu as notificações. Pode ativar quando quiser.';
const MENSAGEM_INSCRICAO =
  'Não foi possível ativar as notificações neste aparelho. Tente de novo mais tarde.';
const MENSAGEM_ATIVAR = 'Não foi possível ativar as notificações. Tente de novo.';
const MENSAGEM_DESATIVAR = 'Não foi possível desativar as notificações. Tente de novo.';

/** Sem service worker ativo (ex.: modo de desenvolvimento), o `ready` nunca resolve. */
export const TEMPO_SERVICE_WORKER_MS = 10_000;

function esperarRegistro(
  serviceWorker: TrabalhadorPush,
  tempoMs: number,
): Promise<RegistroPush | null> {
  return new Promise((resolver) => {
    const relogio = setTimeout(() => resolver(null), tempoMs);
    serviceWorker.ready.then(
      (registro) => {
        clearTimeout(relogio);
        resolver(registro);
      },
      () => {
        clearTimeout(relogio);
        resolver(null);
      },
    );
  });
}

/**
 * Pede a permissão, inscreve este aparelho no serviço de push do navegador e avisa a API. Se a
 * API recusar, desfaz a inscrição para a tela não mostrar como ativo o que o servidor não sabe.
 */
export async function ativarPush(
  api: Api,
  vapidPublicKey: string,
  ambiente: AmbientePush = ambienteDoNavegador(),
  tempoServiceWorkerMs: number = TEMPO_SERVICE_WORKER_MS,
): Promise<ResultadoAtivarPush> {
  if (!suportaPush(ambiente)) return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_SUPORTE };

  let permissao: NotificationPermission;
  try {
    permissao = await ambiente.notificacao.requestPermission();
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_INSCRICAO };
  }
  if (permissao === 'denied') return { tipo: 'BLOQUEADO', mensagem: MENSAGEM_BLOQUEADO };
  if (permissao !== 'granted') return { tipo: 'RECUSADO', mensagem: MENSAGEM_RECUSADO };

  const registro = await esperarRegistro(ambiente.serviceWorker, tempoServiceWorkerMs);
  if (!registro) return { tipo: 'ERRO', mensagem: MENSAGEM_INSCRICAO };

  let inscricao: InscricaoPush;
  let criadaAgora = false;
  try {
    const existente = await registro.pushManager.getSubscription();
    if (existente) {
      inscricao = existente;
    } else {
      inscricao = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveVapidParaBytes(vapidPublicKey),
      });
      criadaAgora = true;
    }
  } catch {
    return { tipo: 'ERRO', mensagem: MENSAGEM_INSCRICAO };
  }

  const { endpoint, keys } = inscricao.toJSON();
  const p256dh = keys?.['p256dh'];
  const auth = keys?.['auth'];
  if (!endpoint || !p256dh || !auth) {
    if (criadaAgora) await cancelarNoNavegador(inscricao);
    return { tipo: 'ERRO', mensagem: MENSAGEM_INSCRICAO };
  }

  let mensagem: string;
  try {
    const { response, error } = await api.POST('/api/v1/me/push', {
      body: { endpoint, keys: { p256dh, auth } },
    });
    if (response.ok) return { tipo: 'ATIVADO' };
    mensagem = mensagemDoErro(lerErroApi(error), MENSAGEM_ATIVAR);
  } catch {
    mensagem = MENSAGEM_SEM_CONEXAO;
  }
  if (criadaAgora) await cancelarNoNavegador(inscricao);
  return { tipo: 'ERRO', mensagem };
}

async function cancelarNoNavegador(inscricao: InscricaoPush): Promise<void> {
  try {
    await inscricao.unsubscribe();
  } catch {
    // A inscrição fica no navegador; a API não a conhece e não manda nada para ela.
  }
}

export type ResultadoDesativarPush = { tipo: 'DESATIVADO' } | { tipo: 'ERRO'; mensagem: string };

/** Tira este aparelho da API e cancela a inscrição no navegador. */
export async function desativarPush(
  api: Api,
  ambiente: AmbientePush = ambienteDoNavegador(),
): Promise<ResultadoDesativarPush> {
  if (!ambiente.serviceWorker) return { tipo: 'DESATIVADO' };
  const inscricao = await inscricaoAtual(ambiente.serviceWorker);
  if (!inscricao) return { tipo: 'DESATIVADO' };

  const { endpoint } = inscricao.toJSON();
  if (endpoint) {
    try {
      const { response, error } = await api.DELETE('/api/v1/me/push', { body: { endpoint } });
      if (!response.ok) {
        return { tipo: 'ERRO', mensagem: mensagemDoErro(lerErroApi(error), MENSAGEM_DESATIVAR) };
      }
    } catch {
      return { tipo: 'ERRO', mensagem: MENSAGEM_SEM_CONEXAO };
    }
  }
  await cancelarNoNavegador(inscricao);
  return { tipo: 'DESATIVADO' };
}

const CHAVE_DISPENSA = 'fa:push-convite-dispensado';

/** O `localStorage` pode lançar só de ser lido (aba anônima, cookies bloqueados). */
function armazenamentoPadrao(): Armazenamento | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Sem armazenamento, o convite volta a cada visita: não dá para lembrar a escolha. */
export function conviteDispensado(armazenamento?: Armazenamento): boolean {
  try {
    return (armazenamento ?? armazenamentoPadrao())?.getItem(CHAVE_DISPENSA) === '1';
  } catch {
    return false;
  }
}

export function dispensarConvite(armazenamento?: Armazenamento): void {
  try {
    (armazenamento ?? armazenamentoPadrao())?.setItem(CHAVE_DISPENSA, '1');
  } catch {
    // Sem armazenamento, o convite some só até sair da aba.
  }
}
