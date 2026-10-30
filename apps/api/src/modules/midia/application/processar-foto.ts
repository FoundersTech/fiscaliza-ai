import { Inject, Injectable } from '@nestjs/common';

import { chavesPublicas, ModeracaoFoto } from '../domain/foto.js';
import {
  type FotoParaProcessar,
  type FotoPreparada,
  ImagemInvalida,
  MODERACAO_PORT,
  type ModeracaoPort,
  PROCESSADOR_IMAGEM,
  type ProcessadorImagem,
  REPOSITORIO_FOTOS,
  type RepositorioFotos,
  STORAGE_PORT,
  type StoragePort,
} from './portas.js';

@Injectable()
export class ProcessarFoto {
  constructor(
    @Inject(REPOSITORIO_FOTOS) private readonly fotos: RepositorioFotos,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(PROCESSADOR_IMAGEM) private readonly imagens: ProcessadorImagem,
    @Inject(MODERACAO_PORT) private readonly moderacao: ModeracaoPort,
  ) {}

  /**
   * Publica a foto aprovada e apaga o original. Uma nova tentativa depois de falhar no meio é
   * segura: a foto já aprovada ou rejeitada só tem o original apagado.
   */
  async executar(fotoId: string, agora = new Date()): Promise<void> {
    const foto = await this.fotos.buscar(fotoId);
    if (!foto) return;
    if (foto.moderacao === ModeracaoFoto.PENDENTE) await this.decidir(foto, agora);
    if (foto.uploadKey) {
      await this.storage.apagarUpload(foto.uploadKey);
      await this.fotos.esquecerOriginal(foto.id);
    }
  }

  private async decidir(foto: FotoParaProcessar, agora: Date): Promise<void> {
    const original = foto.uploadKey ? await this.storage.baixarUpload(foto.uploadKey) : null;
    if (!original) return this.fotos.rejeitar(foto.id, 'O arquivo enviado não foi encontrado.');

    let preparada: FotoPreparada;
    try {
      preparada = await this.imagens.preparar(original);
    } catch (erro) {
      if (erro instanceof ImagemInvalida) return this.fotos.rejeitar(foto.id, erro.message);
      throw erro;
    }

    const decisao = await this.moderacao.avaliar(preparada.foto);
    if (!decisao.aprovada) return this.fotos.rejeitar(foto.id, decisao.motivo);

    const chaves = chavesPublicas(foto.ocorrenciaId, foto.id);
    await this.storage.publicar(chaves.miniatura, preparada.miniatura.conteudo);
    await this.storage.publicar(chaves.foto, preparada.foto.conteudo);
    await this.fotos.aprovar(foto.id, {
      storageKey: chaves.foto,
      miniaturaKey: chaves.miniatura,
      largura: preparada.foto.largura,
      altura: preparada.foto.altura,
      bytes: preparada.foto.conteudo.length,
      exifRemovidoEm: agora,
    });
  }
}
