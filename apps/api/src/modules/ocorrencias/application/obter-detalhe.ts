import { Inject, Injectable } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { UrlFotos } from '../../midia/application/url-fotos.js';
import { Papel } from '../../identidade/domain/papel.js';
import {
  type EtapaAtingida,
  justificativaRecusa,
  linhaDoTempo,
  type Reabertura,
  reaberturas,
  type RespostaOficial,
  respostasOficiais,
} from '../domain/historico.js';
import { type AcoesDoUsuario, Ocorrencia } from '../domain/ocorrencia.js';
import { type Card, MontadorCard } from './card.js';
import { ocorrenciaNaoEncontrada } from './confirmar-ocorrencia.js';
import {
  CONSULTAS_OCORRENCIAS,
  type ConsultasOcorrencias,
  type ReferenciaOriginal,
} from './consultas.js';

/** Quem pede o detalhe; null para visitante. */
export interface Leitor {
  usuarioId: string;
  papel: Papel;
}

export interface FotoDetalhe {
  url: string;
  miniaturaUrl: string | null;
}

/** O detalhe de uma ocorrência. Nada que identifique o autor, exceto o apelido quando ele quis. */
export interface Detalhe extends Card {
  descricao: string;
  atributos: Record<string, unknown>;
  fotos: FotoDetalhe[];
  linhaDoTempo: EtapaAtingida[];
  respostas: RespostaOficial[];
  reaberturas: Reabertura[];
  autorApelido: string | null;
  /** Só aparece para o autor, que é o único que vê uma recusada. */
  justificativaRecusa: string | null;
  /** Só aparece para o autor, que é o único que vê uma duplicada. */
  original: ReferenciaOriginal | null;
  /** Só com token. */
  acoes: AcoesDoUsuario | null;
}

@Injectable()
export class ObterDetalhe {
  constructor(
    @Inject(CONSULTAS_OCORRENCIAS) private readonly consultas: ConsultasOcorrencias,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
    private readonly montadorCard: MontadorCard,
    private readonly urlFotos: UrlFotos,
  ) {}

  async executar(id: string, leitor: Leitor | null, agora = new Date()): Promise<Detalhe> {
    const dados = await this.consultas.detalhe(id);
    if (!dados) throw ocorrenciaNaoEncontrada();
    const ocorrencia = Ocorrencia.reconstituir(dados);
    // Recusada e duplicada só existem para o autor; para os demais, 404 como se não existissem.
    if (!ocorrencia.visivelPara(leitor?.usuarioId ?? null)) throw ocorrenciaNaoEncontrada();

    return {
      ...this.montadorCard.montar(dados, agora, true),
      descricao: dados.descricao,
      atributos: dados.atributos,
      fotos: dados.fotos.map((foto) => ({
        url: this.urlFotos.publica(foto.storageKey),
        miniaturaUrl: foto.miniaturaKey ? this.urlFotos.publica(foto.miniaturaKey) : null,
      })),
      linhaDoTempo: linhaDoTempo(dados.criadaEm, dados.eventos),
      respostas: respostasOficiais(dados.eventos),
      reaberturas: reaberturas(dados.eventos),
      autorApelido: dados.autorApelido,
      justificativaRecusa: justificativaRecusa(dados.status, dados.eventos),
      original: dados.original,
      acoes: leitor ? await this.acoesDe(ocorrencia, leitor, agora) : null,
    };
  }

  private async acoesDe(
    ocorrencia: Ocorrencia,
    leitor: Leitor,
    agora: Date,
  ): Promise<AcoesDoUsuario> {
    // A avaliação já gravada vem da tabela de avaliações, a mesma que o "Avaliar" vai preencher.
    const vinculo = await this.consultas.vinculo(ocorrencia.estado.id, leitor.usuarioId);
    return ocorrencia.acoesPara(
      { usuarioId: leitor.usuarioId, ehCidadao: leitor.papel === Papel.CIDADAO, ...vinculo },
      agora,
      this.parametros.janela_pos_resolucao_dias,
    );
  }
}
