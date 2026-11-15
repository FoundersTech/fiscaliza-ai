export const INTERVALO_SINCRONIZACAO_MS = 60_000;

export interface OpcoesAgenda {
  sincronizar: () => unknown;
  /** Onde escutar o evento `online`. */
  janela?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  online?: () => boolean;
  intervaloMs?: number;
}

/**
 * Envia as pendentes ao abrir o app, quando a conexão volta (evento `online`) e a cada 60 s
 * enquanto houver conexão. Devolve a função que para tudo.
 */
export function agendarSincronizacao({
  sincronizar,
  janela = window,
  online = () => navigator.onLine !== false,
  intervaloMs = INTERVALO_SINCRONIZACAO_MS,
}: OpcoesAgenda): () => void {
  const aoVoltar = (): void => void sincronizar();
  janela.addEventListener('online', aoVoltar);
  const relogio = setInterval(() => {
    if (online()) void sincronizar();
  }, intervaloMs);
  void sincronizar();

  return () => {
    janela.removeEventListener('online', aoVoltar);
    clearInterval(relogio);
  };
}

/** O aviso antes de sair da conta com ocorrências ainda no aparelho. */
export function avisoDeSaida(quantidade: number): string | null {
  if (quantidade === 0) return null;
  return quantidade === 1
    ? 'Você tem 1 ocorrência não enviada. Sair vai descartá-la.'
    : `Você tem ${quantidade} ocorrências não enviadas. Sair vai descartá-las.`;
}

/** O convite para quem está deslogado com ocorrências guardadas no aparelho. */
export function conviteParaEntrar(quantidade: number): string | null {
  if (quantidade === 0) return null;
  return quantidade === 1
    ? 'Entre para enviar sua ocorrência'
    : `Entre para enviar suas ${quantidade} ocorrências`;
}
