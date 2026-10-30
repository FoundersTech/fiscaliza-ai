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
}
