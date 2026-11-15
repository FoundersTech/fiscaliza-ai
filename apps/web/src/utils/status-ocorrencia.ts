import type { components } from '@fiscaliza/contratos';

/** Status como o app mostra. Recusado e duplicado só chegam para o autor. */
export type StatusVisivel = components['schemas']['DetalheResposta']['status_publico'];

const ROTULOS: Record<StatusVisivel, string> = {
  RECEBIDO: 'Recebido',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDO: 'Resolvido',
  RECUSADO: 'Recusado',
  DUPLICADO: 'Duplicado',
};

export function rotuloDoStatusVisivel(status: StatusVisivel): string {
  return ROTULOS[status];
}

/** Recebido ou em andamento: ainda aceita "Também vi". */
export function statusAberto(status: StatusVisivel): boolean {
  return status === 'RECEBIDO' || status === 'EM_ANDAMENTO';
}

/** Classe do selo, a mesma dos cards do feed (`status--em-andamento`). */
export function classeDoStatus(status: StatusVisivel): string {
  return `status--${status.toLowerCase().replace('_', '-')}`;
}

/**
 * Há quanto tempo está aberta, ou quanto levou para ser resolvida. Recusada e duplicada
 * não contam dias: o atendimento terminou sem resolver.
 */
export function textoDosDiasVisivel(dias: number, status: StatusVisivel): string | null {
  if (status === 'RECUSADO' || status === 'DUPLICADO') return null;
  if (status === 'RESOLVIDO') {
    if (dias === 0) return 'Resolvido no mesmo dia';
    return dias === 1 ? 'Resolvido em 1 dia' : `Resolvido em ${dias} dias`;
  }
  if (dias === 0) return 'Aberta hoje';
  return dias === 1 ? '1 dia em aberto' : `${dias} dias em aberto`;
}

/** Data curta, como "14/11/2026". */
export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
}
