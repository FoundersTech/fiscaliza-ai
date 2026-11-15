/** Os backups ficam no bucket com o dia no nome: `postgres/fiscaliza-AAAA-MM-DD.dump`. */
export const PREFIXO_BACKUP = 'postgres/';

/** Quantos dias de backup ficam guardados, contando o de hoje. */
export const DIAS_GUARDADOS = 7;

const FUSO = 'America/Sao_Paulo';
const PADRAO_CHAVE = /^postgres\/fiscaliza-(\d{4}-\d{2}-\d{2})\.dump$/;

/** O dia do calendário em São Paulo, no formato AAAA-MM-DD. */
export function diaLocal(instante: Date): string {
  // O formato sueco já sai como AAAA-MM-DD.
  return instante.toLocaleDateString('sv-SE', { timeZone: FUSO });
}

/** Chave do backup do dia. Um segundo backup no mesmo dia substitui o primeiro. */
export function chaveBackup(instante: Date): string {
  return `${PREFIXO_BACKUP}fiscaliza-${diaLocal(instante)}.dump`;
}

/** O dia de um backup, ou null se a chave não é de um backup. */
export function diaDoBackup(chave: string): string | null {
  return PADRAO_CHAVE.exec(chave)?.[1] ?? null;
}

/**
 * Backups que já passaram dos dias guardados. Chaves que não seguem o padrão ficam onde estão:
 * a limpeza só apaga o que ela mesma gravou.
 */
export function backupsVencidos(chaves: string[], agora: Date): string[] {
  const hoje = new Date(`${diaLocal(agora)}T00:00:00Z`);
  const primeiroGuardado = new Date(hoje.getTime() - (DIAS_GUARDADOS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return chaves.filter((chave) => {
    const dia = diaDoBackup(chave);
    return dia !== null && dia < primeiroGuardado;
  });
}
