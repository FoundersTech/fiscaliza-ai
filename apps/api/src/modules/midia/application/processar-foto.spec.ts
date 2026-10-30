import { describe, expect, it, vi } from 'vitest';

import { chavesPublicas, ModeracaoFoto } from '../domain/foto.js';
import {
  type FotoParaProcessar,
  ImagemInvalida,
  type ModeracaoPort,
  type ProcessadorImagem,
  type RepositorioFotos,
  type StoragePort,
} from './portas.js';
import { ProcessarFoto } from './processar-foto.js';

const AGORA = new Date('2026-11-03T12:00:00.000Z');
const FOTO = 'a1b2c3d4-0000-4000-8000-000000000001';
const OCORRENCIA = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const UPLOAD = `ocorrencias/${OCORRENCIA}/1-abc.jpg`;
const ORIGINAL = Buffer.from('original');
const PREPARADA = {
  foto: { conteudo: Buffer.from('foto-1600'), largura: 1200, altura: 1600 },
  miniatura: { conteudo: Buffer.from('mini'), largura: 300, altura: 400 },
};

function montar(foto: Partial<FotoParaProcessar> | null = {}) {
  const fotos = {
    buscar: vi.fn<RepositorioFotos['buscar']>().mockResolvedValue(
      foto && {
        id: FOTO,
        ocorrenciaId: OCORRENCIA,
        uploadKey: UPLOAD,
        moderacao: ModeracaoFoto.PENDENTE,
        ...foto,
      },
    ),
    aprovar: vi.fn<RepositorioFotos['aprovar']>().mockResolvedValue(),
    rejeitar: vi.fn<RepositorioFotos['rejeitar']>().mockResolvedValue(),
    esquecerOriginal: vi.fn<RepositorioFotos['esquecerOriginal']>().mockResolvedValue(),
    pendentesCriadasAntes: vi.fn<RepositorioFotos['pendentesCriadasAntes']>(),
  };
  const storage = {
    urlDeEnvio: vi.fn<StoragePort['urlDeEnvio']>(),
    existeUpload: vi.fn<StoragePort['existeUpload']>(),
    baixarUpload: vi.fn<StoragePort['baixarUpload']>().mockResolvedValue(ORIGINAL),
    apagarUpload: vi.fn<StoragePort['apagarUpload']>().mockResolvedValue(),
    publicar: vi.fn<StoragePort['publicar']>().mockResolvedValue(),
  };
  const imagens = {
    preparar: vi.fn<ProcessadorImagem['preparar']>().mockResolvedValue(PREPARADA),
  };
  const moderacao = {
    avaliar: vi.fn<ModeracaoPort['avaliar']>().mockResolvedValue({ aprovada: true }),
  };
  const processar = new ProcessarFoto(fotos, storage, imagens, moderacao);
  return { processar, fotos, storage, imagens, moderacao };
}

describe('ProcessarFoto', () => {
  it('aprovada: publica foto e miniatura, grava os dados e apaga o original', async () => {
    const { processar, fotos, storage, imagens } = montar();
    const chaves = chavesPublicas(OCORRENCIA, FOTO);

    await processar.executar(FOTO, AGORA);

    expect(imagens.preparar).toHaveBeenCalledWith(ORIGINAL);
    expect(storage.publicar).toHaveBeenCalledWith(chaves.foto, PREPARADA.foto.conteudo);
    expect(storage.publicar).toHaveBeenCalledWith(chaves.miniatura, PREPARADA.miniatura.conteudo);
    expect(fotos.aprovar).toHaveBeenCalledWith(FOTO, {
      storageKey: chaves.foto,
      miniaturaKey: chaves.miniatura,
      largura: 1200,
      altura: 1600,
      bytes: PREPARADA.foto.conteudo.length,
      exifRemovidoEm: AGORA,
    });
    expect(storage.apagarUpload).toHaveBeenCalledWith(UPLOAD);
    expect(fotos.esquecerOriginal).toHaveBeenCalledWith(FOTO);
  });

  it('arquivo que não é imagem: rejeita com o motivo, não publica e apaga o original', async () => {
    const { processar, fotos, storage, imagens } = montar();
    imagens.preparar.mockRejectedValue(new ImagemInvalida('O arquivo enviado não é uma imagem.'));

    await processar.executar(FOTO, AGORA);

    expect(fotos.rejeitar).toHaveBeenCalledWith(FOTO, 'O arquivo enviado não é uma imagem.');
    expect(storage.publicar).not.toHaveBeenCalled();
    expect(fotos.aprovar).not.toHaveBeenCalled();
    expect(storage.apagarUpload).toHaveBeenCalledWith(UPLOAD);
  });

  it('recusada pela moderação: rejeita com o motivo e não publica', async () => {
    const { processar, fotos, storage, moderacao } = montar();
    moderacao.avaliar.mockResolvedValue({ aprovada: false, motivo: 'Conteúdo impróprio.' });

    await processar.executar(FOTO, AGORA);

    expect(moderacao.avaliar).toHaveBeenCalledWith(PREPARADA.foto);
    expect(fotos.rejeitar).toHaveBeenCalledWith(FOTO, 'Conteúdo impróprio.');
    expect(storage.publicar).not.toHaveBeenCalled();
  });

  it('original que sumiu do bucket: rejeita, em vez de tentar para sempre', async () => {
    const { processar, fotos, imagens, storage } = montar();
    storage.baixarUpload.mockResolvedValue(null);

    await processar.executar(FOTO, AGORA);

    expect(fotos.rejeitar).toHaveBeenCalledWith(FOTO, 'O arquivo enviado não foi encontrado.');
    expect(imagens.preparar).not.toHaveBeenCalled();
  });

  it('nova tentativa de uma foto já aprovada só apaga o original que ficou', async () => {
    const { processar, fotos, storage } = montar({ moderacao: ModeracaoFoto.APROVADA });

    await processar.executar(FOTO, AGORA);

    expect(storage.baixarUpload).not.toHaveBeenCalled();
    expect(storage.publicar).not.toHaveBeenCalled();
    expect(storage.apagarUpload).toHaveBeenCalledWith(UPLOAD);
    expect(fotos.esquecerOriginal).toHaveBeenCalledWith(FOTO);
  });

  it('foto já processada e sem original termina sem fazer nada', async () => {
    const { processar, storage, fotos } = montar({
      moderacao: ModeracaoFoto.REJEITADA,
      uploadKey: null,
    });

    await processar.executar(FOTO, AGORA);

    expect(storage.apagarUpload).not.toHaveBeenCalled();
    expect(fotos.esquecerOriginal).not.toHaveBeenCalled();
  });

  it('foto que não existe mais (ocorrência apagada) termina sem erro', async () => {
    const { processar, storage } = montar(null);

    await processar.executar(FOTO, AGORA);

    expect(storage.baixarUpload).not.toHaveBeenCalled();
  });

  it('falha do storage lança erro para a fila tentar de novo, sem rejeitar a foto', async () => {
    const { processar, fotos, storage } = montar();
    storage.publicar.mockRejectedValue(new Error('R2 fora do ar'));

    await expect(processar.executar(FOTO, AGORA)).rejects.toThrow('R2 fora do ar');
    expect(fotos.rejeitar).not.toHaveBeenCalled();
    expect(fotos.aprovar).not.toHaveBeenCalled();
    expect(storage.apagarUpload).not.toHaveBeenCalled();
  });
});
