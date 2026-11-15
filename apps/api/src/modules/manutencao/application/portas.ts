export const GERADOR_DUMP = Symbol('GERADOR_DUMP');

/** Cópia do banco num arquivo temporário. */
export interface DumpGerado {
  caminho: string;
  bytes: number;
  /** Apaga o arquivo temporário. */
  descartar(): Promise<void>;
}

export interface GeradorDump {
  /** Copia o banco inteiro. Lança erro se a cópia não terminar bem; nada fica pela metade. */
  gerar(): Promise<DumpGerado>;
}

export const ARMAZEM_BACKUP = Symbol('ARMAZEM_BACKUP');

/** O bucket privado dos backups. */
export interface ArmazemBackup {
  enviar(chave: string, caminho: string, bytes: number): Promise<void>;
  /** Todas as chaves com esse prefixo. */
  listar(prefixo: string): Promise<string[]>;
  apagar(chave: string): Promise<void>;
}

export const REPOSITORIO_EXPORTACOES = Symbol('REPOSITORIO_EXPORTACOES');

export interface ExportacaoVencida {
  id: string;
  storageKey: string | null;
}

export interface RepositorioExportacoes {
  /** Exportações prontas cujo prazo de download passou antes de `agora`. */
  vencidas(agora: Date, limite: number): Promise<ExportacaoVencida[]>;
  /** Muda para EXPIRADA e esquece o arquivo. */
  marcarExpirada(id: string): Promise<void>;
}

export const ARQUIVOS_EXPORTACAO = Symbol('ARQUIVOS_EXPORTACAO');

/** Os arquivos das exportações, no bucket privado de uploads. */
export interface ArquivosExportacao {
  /** Apagar um arquivo que já não existe não é erro. */
  apagar(chave: string): Promise<void>;
}
