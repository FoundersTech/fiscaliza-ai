export interface Ponto {
  lat: number;
  lng: number;
}

export interface PartesEndereco {
  rua: string | null;
  numero: string | null;
  bairro: string | null;
}

/**
 * Endereço exibido e gravado na ocorrência: "Rua Quinze de Novembro, 482 · Centro". Sem número,
 * sai "s/n"; sem bairro, só rua e número. Null quando não há rua nem bairro.
 */
export function formatarEndereco(partes: PartesEndereco): string | null {
  const rua = partes.rua?.trim();
  const numero = partes.numero?.trim() || 's/n';
  const bairro = partes.bairro?.trim();

  const trechos = [rua ? `${rua}, ${numero}` : null, bairro || null].filter(Boolean);
  return trechos.length ? trechos.join(' · ') : null;
}
