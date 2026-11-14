import { Inject, Injectable } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { UrlFotos } from '../../midia/application/url-fotos.js';
import {
  diasEmAberto,
  ehUrgente,
  resumir,
  type StatusPublico,
  statusPublicoDe,
} from '../domain/exibicao-publica.js';
import type { CategoriaDoCard, DadosCard } from './consultas.js';

/** Resumo público de uma ocorrência, como aparece no feed. Sem nada que identifique o autor. */
export interface Card {
  id: string;
  protocolo: string;
  categoria: CategoriaDoCard;
  statusPublico: StatusPublico;
  resumo: string;
  endereco: string | null;
  confirmacoes: number;
  urgente: boolean;
  diasEmAberto: number;
  miniaturaUrl: string | null;
  /** Nenhuma foto aprovada ainda: o PWA mostra "foto em análise" no lugar. */
  fotoEmAnalise: boolean;
  criadaEm: Date;
}

/** Monta o card a partir dos dados do banco: selo URGENTE, dias em aberto e miniatura. */
@Injectable()
export class MontadorCard {
  constructor(
    @Inject(PARAMETROS) private readonly parametros: Parametros,
    private readonly urlFotos: UrlFotos,
  ) {}

  urgente(confirmacoes: number): boolean {
    return ehUrgente(confirmacoes, this.parametros.urgente_min_confirmacoes);
  }

  montar(dados: DadosCard, agora: Date): Card {
    const statusPublico = statusPublicoDe(dados.status);
    if (!statusPublico) {
      throw new Error(`A ocorrência ${dados.id} (${dados.status}) não é pública.`);
    }
    const miniaturaUrl = dados.miniaturaKey ? this.urlFotos.publica(dados.miniaturaKey) : null;
    return {
      id: dados.id,
      protocolo: dados.protocolo,
      categoria: dados.categoria,
      statusPublico,
      resumo: resumir(dados.descricao),
      endereco: dados.endereco,
      confirmacoes: dados.confirmacoes,
      urgente: this.urgente(dados.confirmacoes),
      diasEmAberto: diasEmAberto(dados.criadaEm, dados.resolvidaEm, agora),
      miniaturaUrl,
      fotoEmAnalise: miniaturaUrl === null,
      criadaEm: dados.criadaEm,
    };
  }
}
