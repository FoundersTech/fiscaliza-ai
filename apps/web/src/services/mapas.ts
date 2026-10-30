import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export class MapaIndisponivel extends Error {
  override readonly name = 'MapaIndisponivel';
}

let configurado = false;
let chaveRecusada = false;
const aoRecusar = new Set<() => void>();

/**
 * Carrega o Maps JavaScript API uma vez. Sem chave no build, ou com a chave recusada pelo
 * Google (site fora da restrição, API não liberada), lança MapaIndisponivel.
 */
export async function carregarMaps(): Promise<{
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
}> {
  const chave = import.meta.env.GOOGLE_MAPS_API_KEY as string | undefined;
  if (!chave || chaveRecusada) throw new MapaIndisponivel('Mapa indisponível');

  if (!configurado) {
    setOptions({ key: chave, v: 'weekly', language: 'pt-BR', region: 'BR' });
    // O Google chama esta função global quando recusa a chave, mesmo depois de carregar.
    (window as { gm_authFailure?: () => void }).gm_authFailure = () => {
      chaveRecusada = true;
      aoRecusar.forEach((avisar) => avisar());
    };
    configurado = true;
  }

  try {
    const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
    ]);
    return { Map, AdvancedMarkerElement };
  } catch {
    throw new MapaIndisponivel('Mapa indisponível');
  }
}

/** Avisa quando o Google recusar a chave. Devolve a função que cancela o aviso. */
export function quandoRecusarChave(avisar: () => void): () => void {
  aoRecusar.add(avisar);
  return () => aoRecusar.delete(avisar);
}
