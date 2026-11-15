export const StatusExportacao = {
  PROCESSANDO: 'PROCESSANDO',
  PRONTA: 'PRONTA',
  FALHOU: 'FALHOU',
  EXPIRADA: 'EXPIRADA',
} as const;
export type StatusExportacao = (typeof StatusExportacao)[keyof typeof StatusExportacao];

export const STATUS_EXPORTACAO: readonly StatusExportacao[] = Object.values(StatusExportacao);

/** O arquivo fica disponível por 7 dias depois de pronto. */
export const VALIDADE_ARQUIVO_MS = 7 * 24 * 60 * 60 * 1000;

/** O link de download vale por 15 minutos. */
export const VALIDADE_LINK_S = 15 * 60;

export interface Exportacao {
  id: string;
  usuarioId: string;
  status: StatusExportacao;
  storageKey: string | null;
  solicitadaEm: Date;
  prontaEm: Date | null;
  expiraEm: Date | null;
}

/**
 * Status visto pelo cidadão. Uma exportação pronta cujo prazo passou já conta como expirada,
 * mesmo antes de a limpeza diária apagar o arquivo.
 */
export function statusVigente(exportacao: Exportacao, agora: Date): StatusExportacao {
  if (
    exportacao.status === StatusExportacao.PRONTA &&
    (exportacao.expiraEm === null || exportacao.expiraEm <= agora)
  ) {
    return StatusExportacao.EXPIRADA;
  }
  return exportacao.status;
}

/** Em andamento ou pronta para baixar: um novo pedido devolve esta mesma. */
export function aproveitavel(exportacao: Exportacao, agora: Date): boolean {
  const status = statusVigente(exportacao, agora);
  return status === StatusExportacao.PROCESSANDO || status === StatusExportacao.PRONTA;
}

/** Chave do arquivo no bucket privado, separada das fotos das ocorrências. */
export function chaveDoArquivo(usuarioId: string, exportacaoId: string): string {
  return `exportacoes/${usuarioId}/${exportacaoId}.json`;
}

export function expiracaoDe(prontaEm: Date): Date {
  return new Date(prontaEm.getTime() + VALIDADE_ARQUIVO_MS);
}
