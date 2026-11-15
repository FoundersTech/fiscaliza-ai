import { Inject, Injectable } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { type StatusPublico, statusPublicoDe } from '../domain/exibicao-publica.js';
import { MontadorCard } from './card.js';
import { type AreaMapa, CONSULTAS_OCORRENCIAS, type ConsultasOcorrencias } from './consultas.js';
import { filtroPublico, type FiltrosPublicos } from './listar-feed.js';

/** Máximo de pontos por consulta; acima disso, o PWA pede para aproximar o mapa. */
export const MAXIMO_PONTOS_MAPA = 2000;

export interface PedidoMapa extends FiltrosPublicos {
  /** `minLng,minLat,maxLng,maxLat`, como o Google Maps entrega os limites da tela. */
  bbox?: string | null;
}

export interface PontoMapa {
  id: string;
  lat: number;
  lng: number;
  statusPublico: StatusPublico;
  categoriaSlug: string;
  urgente: boolean;
}

export interface ResultadoMapa {
  pontos: PontoMapa[];
  /** Havia mais pontos na área do que o máximo. */
  truncado: boolean;
}

/** Lê `minLng,minLat,maxLng,maxLat`; qualquer coisa fora disso é BBOX_INVALIDA. */
export function lerAreaMapa(bbox: string | null | undefined): AreaMapa {
  const partes = (bbox ?? '').split(',').map((parte) => parte.trim());
  const numeros = partes.map((parte) => (parte === '' ? Number.NaN : Number(parte)));
  if (numeros.length !== 4 || numeros.some((numero) => !Number.isFinite(numero))) {
    throw bboxInvalida('Informe bbox=minLng,minLat,maxLng,maxLat.');
  }
  const [oeste, sul, leste, norte] = numeros as [number, number, number, number];
  if ([oeste, leste].some((lng) => lng < -180 || lng > 180)) {
    throw bboxInvalida('A longitude deve ficar entre -180 e 180.');
  }
  if ([sul, norte].some((lat) => lat < -90 || lat > 90)) {
    throw bboxInvalida('A latitude deve ficar entre -90 e 90.');
  }
  if (oeste > leste || sul > norte) {
    throw bboxInvalida('O mínimo de cada eixo deve vir antes do máximo.');
  }
  return { oeste, sul, leste, norte };
}

function bboxInvalida(mensagem: string): ErroAplicacao {
  return new ErroAplicacao('BBOX_INVALIDA', mensagem, 422);
}

/** Pontos do mapa público, com as mesmas regras de visibilidade do feed. */
@Injectable()
export class ListarMapa {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    private readonly montadorCard: MontadorCard,
  ) {}

  async executar(pedido: PedidoMapa): Promise<ResultadoMapa> {
    const area = lerAreaMapa(pedido.bbox);
    const linhas = await this.consultas.pontosNaArea(
      filtroPublico(pedido),
      area,
      MAXIMO_PONTOS_MAPA + 1,
    );
    const pontos: PontoMapa[] = [];
    for (const linha of linhas.slice(0, MAXIMO_PONTOS_MAPA)) {
      const statusPublico = statusPublicoDe(linha.status);
      if (!statusPublico) continue;
      pontos.push({
        id: linha.id,
        lat: linha.lat,
        lng: linha.lng,
        statusPublico,
        categoriaSlug: linha.categoriaSlug,
        urgente: this.montadorCard.urgente(linha.confirmacoes),
      });
    }
    return { pontos, truncado: linhas.length > MAXIMO_PONTOS_MAPA };
  }
}
