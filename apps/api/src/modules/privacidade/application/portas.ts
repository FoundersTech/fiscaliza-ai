import type { Exportacao } from '../domain/exportacao.js';

export const REPOSITORIO_EXPORTACOES = Symbol('REPOSITORIO_EXPORTACOES');

export interface RepositorioExportacoes {
  /**
   * Devolve a exportação aproveitável do usuário ou cria uma nova, numa transação que trava o
   * usuário: dois pedidos ao mesmo tempo não criam duas.
   */
  aproveitarOuCriar(
    usuarioId: string,
    agora: Date,
    aproveitavel: (exportacao: Exportacao) => boolean,
  ): Promise<{ exportacao: Exportacao; criada: boolean }>;
  buscar(id: string): Promise<Exportacao | null>;
  /** As mais recentes primeiro. */
  doUsuario(usuarioId: string, limite: number): Promise<Exportacao[]>;
  /** Só muda a exportação que ainda está PROCESSANDO. */
  marcarPronta(id: string, storageKey: string, prontaEm: Date, expiraEm: Date): Promise<boolean>;
  /** Só muda a exportação que ainda está PROCESSANDO. */
  marcarFalha(id: string): Promise<void>;
}

export const ARQUIVOS_EXPORTACAO = Symbol('ARQUIVOS_EXPORTACAO');

export interface ArquivosExportacao {
  gravar(chave: string, json: string): Promise<void>;
  /** URL pré-assinada de GET, que baixa o arquivo com o nome informado. */
  urlDeDownload(chave: string, nomeArquivo: string, validadeSegundos: number): Promise<string>;
  /** Apagar um arquivo que já não existe não é erro. */
  apagar(chave: string): Promise<void>;
}

export interface LocalExportado {
  lat: number;
  lng: number;
}

/** Tudo o que a plataforma guarda do usuário, no formato do arquivo exportado. */
export interface DadosPessoais {
  conta: {
    id: string;
    nome: string;
    apelido_publico: string;
    email: string;
    papel: string;
    criado_em: string;
    politica_versao: string | null;
    politica_aceita_em: string | null;
  };
  ocorrencias: {
    id: string;
    protocolo: string;
    categoria: string;
    descricao: string;
    atributos: unknown;
    local: LocalExportado;
    endereco: string | null;
    status: string;
    publicar_autor: boolean;
    criada_em: string;
    resolvida_em: string | null;
  }[];
  confirmacoes: { ocorrencia_id: string; protocolo: string; criada_em: string }[];
  avaliacoes: {
    ocorrencia_id: string;
    protocolo: string;
    nota: number;
    comentario: string | null;
    criada_em: string;
  }[];
}

export const COLETOR_DADOS = Symbol('COLETOR_DADOS');

export interface ColetorDados {
  /** Null se o usuário não existe mais ou foi anonimizado. */
  coletar(usuarioId: string): Promise<DadosPessoais | null>;
}

export const REPOSITORIO_CONTAS = Symbol('REPOSITORIO_CONTAS');

export interface RepositorioContas {
  /** Hash da senha de uma conta que ainda pode entrar, ou null. */
  senhaDe(usuarioId: string): Promise<string | null>;
  /**
   * Anonimiza a conta numa única transação: troca nome, apelido e e-mail, apaga a senha,
   * desvincula as ocorrências e apaga sessões, links, inscrições de push e exportações.
   * Devolve as chaves dos arquivos das exportações apagadas.
   */
  anonimizar(usuarioId: string, agora: Date): Promise<string[]>;
}
