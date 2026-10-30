/** O PWA comprime cada foto para JPEG de até 300 KB antes de enviar. */
export const TIPO_FOTO = 'image/jpeg';
export const TAMANHO_MAXIMO_FOTO = 300 * 1024;
export const ORDENS_FOTO = [1, 2] as const;

export type OrdemFoto = (typeof ORDENS_FOTO)[number];

export function fotoAceita(contentType: string, bytes: number): boolean {
  return (
    contentType === TIPO_FOTO &&
    Number.isInteger(bytes) &&
    bytes > 0 &&
    bytes <= TAMANHO_MAXIMO_FOTO
  );
}

/**
 * Chave do original no bucket de uploads. O sufixo aleatório impede que quem conhece o id da
 * ocorrência sobrescreva a foto de outra pessoa.
 */
export function chaveDoUpload(ocorrenciaId: string, ordem: OrdemFoto, sufixo: string): string {
  return `${prefixoDaOcorrencia(ocorrenciaId)}${ordem}-${sufixo}.jpg`;
}

export function prefixoDaOcorrencia(ocorrenciaId: string): string {
  return `ocorrencias/${ocorrenciaId}/`;
}
