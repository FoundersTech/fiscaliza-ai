export interface Ponto {
  lat: number;
  lng: number;
}

export const TEMPO_GPS_MS = 10_000;
/** Acima disso, o ponto do GPS pode estar do outro lado da rua: a tela pede para conferir. */
export const PRECISAO_ACEITAVEL_M = 100;

export type FalhaGps = 'NEGADA' | 'INDISPONIVEL' | 'TEMPO_ESGOTADO' | 'SEM_SUPORTE';

export type LeituraGps =
  { ok: true; ponto: Ponto; precisaoM: number } | { ok: false; falha: FalhaGps };

// Códigos de GeolocationPositionError.
const PERMISSAO_NEGADA = 1;
const TEMPO_ESGOTADO = 3;

/** Uma leitura do GPS com alta precisão. Nunca rejeita: a falha vem no resultado. */
export function lerGps(
  geolocalizacao: Geolocation | undefined = globalThis.navigator?.geolocation,
): Promise<LeituraGps> {
  if (!geolocalizacao) return Promise.resolve({ ok: false, falha: 'SEM_SUPORTE' });
  return new Promise((resolver) => {
    geolocalizacao.getCurrentPosition(
      ({ coords }) =>
        resolver({
          ok: true,
          ponto: { lat: coords.latitude, lng: coords.longitude },
          precisaoM: Math.round(coords.accuracy),
        }),
      (erro) =>
        resolver({
          ok: false,
          falha:
            erro.code === PERMISSAO_NEGADA
              ? 'NEGADA'
              : erro.code === TEMPO_ESGOTADO
                ? 'TEMPO_ESGOTADO'
                : 'INDISPONIVEL',
        }),
      { enableHighAccuracy: true, timeout: TEMPO_GPS_MS, maximumAge: 0 },
    );
  });
}

export function precisaoBaixa(precisaoM: number | null): boolean {
  return precisaoM !== null && precisaoM > PRECISAO_ACEITAVEL_M;
}
