import type { components } from '@fiscaliza/contratos';

import type { Api } from './api';
import type { Ponto } from './localizacao';

export type PontoMapa = components['schemas']['PontoMapaResposta'];
export type StatusPublico = PontoMapa['status_publico'];
type Categoria = components['schemas']['CategoriaResposta'];

/** Retângulo no formato do município em `/config/publica`. */
export interface Limites {
  sul: number;
  oeste: number;
  norte: number;
  leste: number;
}

/** Espera o mapa parar de mexer antes de buscar os pontos da área visível. */
export const ESPERA_PONTOS_MS = 300;

/** Zoom ao centralizar num ponto (busca sem área ou "minha localização"). */
export const ZOOM_PONTO = 16;

interface EstiloStatus {
  rotulo: string;
  /** Cor do alfinete e da legenda. */
  cor: string;
  /** Contorno do alfinete, um tom mais escuro. */
  borda: string;
}

/** Laranja para Recebido, azul para Em andamento e verde para Resolvido. */
export const STATUS_NO_MAPA: Record<StatusPublico, EstiloStatus> = {
  RECEBIDO: { rotulo: 'Recebido', cor: '#f97316', borda: '#c2410c' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', cor: '#2563eb', borda: '#1e40af' },
  RESOLVIDO: { rotulo: 'Resolvido', cor: '#16a34a', borda: '#166534' },
};

/** Itens da legenda, na ordem do andamento. */
export const LEGENDA = (['RECEBIDO', 'EM_ANDAMENTO', 'RESOLVIDO'] as const).map((status) => ({
  status,
  ...STATUS_NO_MAPA[status],
}));

export interface EstiloAlfinete {
  background: string;
  borderColor: string;
  glyphColor: string;
  /** "!" nas urgentes; as demais ficam com o miolo padrão. */
  glyphText: string | null;
}

export function estiloDoAlfinete(
  ponto: Pick<PontoMapa, 'status_publico' | 'urgente'>,
): EstiloAlfinete {
  const { cor, borda } = STATUS_NO_MAPA[ponto.status_publico];
  return {
    background: cor,
    borderColor: borda,
    glyphColor: '#ffffff',
    glyphText: ponto.urgente ? '!' : null,
  };
}

/** Identifica o alfinete: se o status ou a urgência mudam, o alfinete é trocado. */
export function chaveDoPonto(ponto: PontoMapa): string {
  return `${ponto.id}|${ponto.status_publico}|${ponto.urgente ? 'U' : ''}`;
}

/** O que entra e o que sai do mapa quando chega a resposta de uma nova área. */
export function diferencaDePontos(
  atuais: Iterable<string>,
  pontos: PontoMapa[],
): { entrar: PontoMapa[]; sair: string[] } {
  const novas = new Map(pontos.map((ponto) => [chaveDoPonto(ponto), ponto]));
  const jaNoMapa = new Set(atuais);
  return {
    entrar: [...novas].filter(([chave]) => !jaNoMapa.has(chave)).map(([, ponto]) => ponto),
    sair: [...jaNoMapa].filter((chave) => !novas.has(chave)),
  };
}

const arredondar = (valor: number) => Math.round(valor * 1e6) / 1e6;
const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, valor));

/**
 * Converte a área visível no `bbox=minLng,minLat,maxLng,maxLat` da API. Com o mapa bem afastado,
 * o Google devolve a longitude passando de 180 (oeste maior que leste): aí vale a volta inteira.
 */
export function montarBbox(area: Limites): string {
  const cruzaAntimeridiano = area.oeste > area.leste;
  const oeste = cruzaAntimeridiano ? -180 : limitar(area.oeste, -180, 180);
  const leste = cruzaAntimeridiano ? 180 : limitar(area.leste, -180, 180);
  const sul = limitar(Math.min(area.sul, area.norte), -90, 90);
  const norte = limitar(Math.max(area.sul, area.norte), -90, 90);
  return [oeste, sul, leste, norte].map(arredondar).join(',');
}

/** Limites do Google Maps (`LatLngBounds.toJSON()`) no formato do app. */
export function limitesDoGoogle(area: google.maps.LatLngBoundsLiteral): Limites {
  return { sul: area.south, oeste: area.west, norte: area.north, leste: area.east };
}

export type ResultadoPontos = { ok: true; pontos: PontoMapa[]; truncado: boolean } | { ok: false };

/** `GET /ocorrencias/mapa` da área. Nunca rejeita: a falha vem no resultado. */
export async function buscarPontos(
  api: Api,
  bbox: string,
  municipio?: number,
): Promise<ResultadoPontos> {
  try {
    const { data } = await api.GET('/api/v1/ocorrencias/mapa', {
      params: { query: { bbox, ...(municipio ? { municipio } : {}) } },
    });
    return data ? { ok: true, pontos: data.pontos, truncado: data.truncado } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export interface BuscaPontos {
  /** Pede os pontos da área depois de `esperaMs` sem novos movimentos. */
  agendar(area: Limites): void;
  /** Busca de novo a última área, sem esperar (botão "Tentar de novo"). */
  repetir(): void;
  cancelar(): void;
}

/**
 * Busca os pontos da área visível sem disparar uma requisição a cada passo do arraste ou do zoom.
 * Só a resposta da última área pedida chega à tela; uma lenta que volta depois é descartada.
 */
export function criarBuscaPontos(opcoes: {
  buscar: (bbox: string) => Promise<ResultadoPontos>;
  aoResponder: (resultado: ResultadoPontos) => void;
  esperaMs?: number;
}): BuscaPontos {
  const esperaMs = opcoes.esperaMs ?? ESPERA_PONTOS_MS;
  let espera: ReturnType<typeof setTimeout> | undefined;
  let ultimaBbox: string | null = null;
  let bboxCarregada: string | null = null;
  let consulta = 0;

  async function executar(bbox: string): Promise<void> {
    const esta = ++consulta;
    const resultado = await opcoes.buscar(bbox);
    if (esta !== consulta) return;
    bboxCarregada = resultado.ok ? bbox : null;
    opcoes.aoResponder(resultado);
  }

  return {
    agendar(area) {
      clearTimeout(espera);
      const bbox = montarBbox(area);
      ultimaBbox = bbox;
      // O mapa avisa que parou mesmo sem ter saído do lugar: a mesma área não é buscada de novo.
      if (bbox === bboxCarregada) {
        consulta++;
        return;
      }
      espera = setTimeout(() => void executar(bbox), esperaMs);
    },
    repetir() {
      clearTimeout(espera);
      if (ultimaBbox) void executar(ultimaBbox);
    },
    cancelar() {
      clearTimeout(espera);
      consulta++;
    },
  };
}

export interface ResumoPonto {
  titulo: string;
  icone: string;
  statusPublico: StatusPublico;
  status: EstiloStatus;
  urgente: boolean;
  link: string;
}

/** O que o cartão mostra ao tocar no alfinete; o resto fica no detalhe. */
export function resumoDoPonto(ponto: PontoMapa, categorias: Categoria[]): ResumoPonto {
  const categoria = categorias.find((item) => item.slug === ponto.categoria_slug);
  return {
    titulo: categoria?.nome ?? 'Ocorrência',
    icone: `sym_o_${categoria?.icone ?? 'location_on'}`,
    statusPublico: ponto.status_publico,
    status: STATUS_NO_MAPA[ponto.status_publico],
    urgente: ponto.urgente,
    link: `/ocorrencias/${ponto.id}`,
  };
}

export type DestinoBusca = { area: google.maps.LatLngBoundsLiteral } | { ponto: Ponto } | null;

/** Um bairro vem com área (o mapa enquadra o bairro); um endereço, só com o ponto. */
export function destinoDaBusca(lugar: {
  viewport?: google.maps.LatLngBoundsLiteral | null;
  location?: google.maps.LatLngLiteral | null;
}): DestinoBusca {
  if (lugar.viewport) return { area: lugar.viewport };
  if (lugar.location) return { ponto: lugar.location };
  return null;
}
