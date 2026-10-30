import type { ModeracaoFoto } from '../domain/foto.js';

export const STORAGE_PORT = Symbol('STORAGE_PORT');

export interface PedidoEnvio {
  chave: string;
  contentType: string;
  bytes: number;
  emitidaEm: Date;
  validadeSegundos: number;
}

export interface StoragePort {
  /** URL de PUT no bucket de uploads que só aceita esse tipo e exatamente esse tamanho. */
  urlDeEnvio(pedido: PedidoEnvio): Promise<string>;
  /** Se o arquivo chegou ao bucket de uploads. Falha de rede lança erro. */
  existeUpload(chave: string): Promise<boolean>;
  /** Conteúdo do original no bucket de uploads, ou null se ele não existe. */
  baixarUpload(chave: string): Promise<Buffer | null>;
  /** Apagar um original que já não existe não é erro. */
  apagarUpload(chave: string): Promise<void>;
  /** Grava um JPEG no bucket público. */
  publicar(chave: string, jpeg: Buffer): Promise<void>;
}

export interface Jpeg {
  conteudo: Buffer;
  largura: number;
  altura: number;
}

export interface FotoPreparada {
  foto: Jpeg;
  miniatura: Jpeg;
}

/** O arquivo enviado não é uma imagem que dê para publicar. A mensagem vira o motivo. */
export class ImagemInvalida extends Error {
  override readonly name = 'ImagemInvalida';
}

export const PROCESSADOR_IMAGEM = Symbol('PROCESSADOR_IMAGEM');

export interface ProcessadorImagem {
  /** Recodifica o original em JPEG sem metadados, na foto e na miniatura. Lança ImagemInvalida. */
  preparar(original: Buffer): Promise<FotoPreparada>;
}

export type DecisaoModeracao = { aprovada: true } | { aprovada: false; motivo: string };

export const MODERACAO_PORT = Symbol('MODERACAO_PORT');

export interface ModeracaoPort {
  avaliar(foto: Jpeg): Promise<DecisaoModeracao>;
}

export const REPOSITORIO_FOTOS = Symbol('REPOSITORIO_FOTOS');

export interface FotoParaProcessar {
  id: string;
  ocorrenciaId: string;
  uploadKey: string | null;
  moderacao: ModeracaoFoto;
}

export interface FotoPublicada {
  storageKey: string;
  miniaturaKey: string;
  largura: number;
  altura: number;
  bytes: number;
  exifRemovidoEm: Date;
}

export interface RepositorioFotos {
  buscar(id: string): Promise<FotoParaProcessar | null>;
  /** Só muda a foto que ainda está PENDENTE. */
  aprovar(id: string, publicada: FotoPublicada): Promise<void>;
  /** Só muda a foto que ainda está PENDENTE. */
  rejeitar(id: string, motivo: string): Promise<void>;
  /** Limpa a upload_key depois que o original foi apagado. */
  esquecerOriginal(id: string): Promise<void>;
  /** Ids das fotos PENDENTE criadas antes de `antesDe`, das mais antigas para as mais novas. */
  pendentesCriadasAntes(antesDe: Date, limite: number): Promise<string[]>;
}
