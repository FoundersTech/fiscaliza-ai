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

/** Status de quem não é o autor: os que aparecem no feed e no mapa. */
export type StatusPublico = Exclude<StatusVisivel, 'RECUSADO' | 'DUPLICADO'>;

export function rotuloDoStatusVisivel(status: StatusVisivel): string {
  return ROTULOS[status];
}

/** Os status públicos na ordem do atendimento, com o texto que aparece no app. */
export const STATUS_PUBLICOS: { valor: StatusPublico; rotulo: string }[] = (
  ['RECEBIDO', 'EM_ANDAMENTO', 'RESOLVIDO'] as const
).map((valor) => ({ valor, rotulo: ROTULOS[valor] }));

export function rotuloDoStatus(status: StatusPublico): string {
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

/** Há quanto tempo está aberta, ou quanto levou para ser resolvida. */
export function textoDosDias(dias: number, status: StatusPublico): string {
  if (status === 'RESOLVIDO') {
    if (dias === 0) return 'Resolvido no mesmo dia';
    return dias === 1 ? 'Resolvido em 1 dia' : `Resolvido em ${dias} dias`;
  }
  if (dias === 0) return 'Aberta hoje';
  return dias === 1 ? '1 dia em aberto' : `${dias} dias em aberto`;
}

/**
 * Como `textoDosDias`, mas recusada e duplicada não contam dias: o atendimento terminou
 * sem resolver.
 */
export function textoDosDiasVisivel(dias: number, status: StatusVisivel): string | null {
  if (status === 'RECUSADO' || status === 'DUPLICADO') return null;
  return textoDosDias(dias, status);
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
