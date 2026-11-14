import { Inject, Injectable } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { ModeracaoFoto } from '../domain/foto.js';
import {
  type FotoEmRevisao,
  REPOSITORIO_FOTOS,
  type RepositorioFotos,
  STORAGE_PORT,
  type StoragePort,
} from './portas.js';
import { UrlFotos } from './url-fotos.js';

export function erroFotoNaoEncontrada(): ErroAplicacao {
  return new ErroAplicacao('NAO_ENCONTRADA', 'Foto não encontrada.', 404);
}

export function erroFotoEmAnalise(): ErroAplicacao {
  return new ErroAplicacao(
    'FOTO_EM_ANALISE',
    'A foto ainda está em processamento. Tente de novo em instantes.',
    409,
  );
}

export interface FotoRevisada {
  id: string;
  ocorrenciaId: string;
  protocolo: string;
  ordem: number;
  moderacao: ModeracaoFoto;
  /** Só a foto aprovada tem endereço público. */
  url: string | null;
  miniaturaUrl: string | null;
  motivoRejeicao: string | null;
  criadaEm: Date;
}

export interface PaginaRevisao {
  itens: FotoRevisada[];
  /** Null na última página. */
  proximoCursor: string | null;
}

export interface PedidoRevisao {
  moderacao: ModeracaoFoto;
  cursor: string | null;
  limite: number;
}

/** Fotos recentes para o administrador da plataforma revisar, das mais novas às mais antigas. */
@Injectable()
export class ListarFotosParaRevisao {
  constructor(
    @Inject(REPOSITORIO_FOTOS) private readonly fotos: RepositorioFotos,
    private readonly urlFotos: UrlFotos,
  ) {}

  async executar({ moderacao, cursor, limite }: PedidoRevisao): Promise<PaginaRevisao> {
    // Uma a mais, para saber se há próxima página.
    const fotos = await this.fotos.listarParaRevisao({
      moderacao,
      depoisDe: cursor,
      limite: limite + 1,
    });
    const pagina = fotos.slice(0, limite);
    return {
      itens: pagina.map((foto) => this.revisada(foto)),
      proximoCursor: fotos.length > limite ? pagina.at(-1)!.id : null,
    };
  }

  private revisada(foto: FotoEmRevisao): FotoRevisada {
    const publica = foto.moderacao === ModeracaoFoto.APROVADA;
    return {
      id: foto.id,
      ocorrenciaId: foto.ocorrenciaId,
      protocolo: foto.protocolo,
      ordem: foto.ordem,
      moderacao: foto.moderacao,
      url: publica && foto.storageKey ? this.urlFotos.publica(foto.storageKey) : null,
      miniaturaUrl: publica && foto.miniaturaKey ? this.urlFotos.publica(foto.miniaturaKey) : null,
      motivoRejeicao: foto.motivoRejeicao,
      criadaEm: foto.criadaEm,
    };
  }
}

/**
 * Tira do ar uma foto já publicada: a API para de devolvê-la na hora, e a foto e a miniatura são
 * apagadas do bucket público. Repetir o pedido apaga os objetos de novo e mantém o primeiro motivo.
 */
@Injectable()
export class RejeitarFoto {
  constructor(
    @Inject(REPOSITORIO_FOTOS) private readonly fotos: RepositorioFotos,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async executar(id: string, motivo: string): Promise<void> {
    const foto = await this.fotos.buscarParaRevisao(id);
    if (!foto) throw erroFotoNaoEncontrada();
    // A pendente ainda vai ser publicada pelo processamento; rejeitar agora deixaria o objeto no ar.
    if (foto.moderacao === ModeracaoFoto.PENDENTE) throw erroFotoEmAnalise();

    // Primeiro o banco, para a foto sumir das telas mesmo se o storage falhar.
    if (foto.moderacao === ModeracaoFoto.APROVADA) await this.fotos.rejeitarAprovada(id, motivo);
    for (const chave of [foto.miniaturaKey, foto.storageKey]) {
      if (chave) await this.storage.despublicar(chave);
    }
  }
}
