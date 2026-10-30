import { describe, expect, it, vi } from 'vitest';

import type { Parametros } from '../../../shared/config/parametros.js';
import type { ConferirUploads, FilaFotos } from '../../midia/application/fotos-enviadas.js';
import type {
  EnderecoReverso,
  ResolverTerritorio,
} from '../../territorio/application/territorio.js';
import type { FilaEnderecos } from './enderecos.js';
import type { RepositorioOcorrencias } from './portas.js';
import { type PedidoRegistro, RegistrarOcorrencia } from './registrar-ocorrencia.js';

const ID = '0b9f3c2e-5d1a-4f6b-9c8e-7a6d5c4b3a21';
const MARIA = 'f2b6c1de-0000-4000-8000-000000000001';
const JOAO = 'f2b6c1de-0000-4000-8000-000000000002';
const AGORA = new Date('2026-11-03T12:00:00.000Z');
const GRAVADA = {
  id: ID,
  autorId: MARIA,
  protocolo: 'FA-2026-SOR-000001',
  status: 'RECEBIDA' as const,
};

function montar() {
  const repositorio = {
    buscar: vi.fn<RepositorioOcorrencias['buscar']>().mockResolvedValue(null),
    categoriaAtiva: vi
      .fn<RepositorioOcorrencias['categoriaAtiva']>()
      .mockResolvedValue({ id: 2, schemaAtributos: [] }),
    candidatasDuplicidade: vi
      .fn<RepositorioOcorrencias['candidatasDuplicidade']>()
      .mockResolvedValue([]),
    criar: vi
      .fn<RepositorioOcorrencias['criar']>()
      .mockResolvedValue({ criada: true, ocorrencia: GRAVADA, fotoIds: ['foto-1'] }),
    localSemEndereco: vi.fn<RepositorioOcorrencias['localSemEndereco']>(),
    gravarEndereco: vi.fn<RepositorioOcorrencias['gravarEndereco']>(),
  };
  const territorio = {
    executar: vi
      .fn<ResolverTerritorio['executar']>()
      .mockResolvedValue({ municipioId: 3552205, municipioSigla: 'SOR', orgaoId: 1 }),
  };
  const endereco = {
    executar: vi.fn<EnderecoReverso['executar']>().mockResolvedValue('Rua A, 1 · Centro'),
  };
  const uploads = { executar: vi.fn<ConferirUploads['executar']>().mockResolvedValue() };
  const filaFotos = { processar: vi.fn<FilaFotos['processar']>().mockResolvedValue() };
  const filaEnderecos = { preencher: vi.fn<FilaEnderecos['preencher']>().mockResolvedValue() };
  const registrar = new RegistrarOcorrencia(
    repositorio,
    { duplicidade_raio_m: 60 } as Parametros,
    territorio as unknown as ResolverTerritorio,
    endereco as unknown as EnderecoReverso,
    uploads as unknown as ConferirUploads,
    filaFotos as unknown as FilaFotos,
    filaEnderecos as unknown as FilaEnderecos,
  );
  return { registrar, repositorio, territorio, endereco, uploads, filaFotos, filaEnderecos };
}

function pedido(mudancas: Partial<PedidoRegistro> = {}): PedidoRegistro {
  return {
    id: ID,
    autorId: MARIA,
    categoriaId: 2,
    descricao: 'Poste apagado há uma semana',
    atributos: undefined,
    local: { lat: -23.5015, lng: -47.4526 },
    precisaoM: 8,
    publicarAutor: false,
    fotos: [{ uploadKey: `ocorrencias/${ID}/1-abc.jpg`, ordem: 1 }],
    origem: 'ONLINE',
    forcarCriacao: false,
    ...mudancas,
  };
}

describe('RegistrarOcorrencia', () => {
  it('grava com o território e o endereço e enfileira as fotos', async () => {
    const { registrar, repositorio, uploads, filaFotos, filaEnderecos } = montar();

    const registro = await registrar.executar(pedido(), AGORA);

    expect(registro).toEqual({ criada: true, ocorrencia: GRAVADA });
    expect(uploads.executar).toHaveBeenCalledWith(ID, [`ocorrencias/${ID}/1-abc.jpg`]);
    expect(repositorio.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        municipioId: 3552205,
        municipioSigla: 'SOR',
        orgaoId: 1,
        endereco: 'Rua A, 1 · Centro',
        atributos: {},
        criadaEm: AGORA,
      }),
    );
    expect(filaFotos.processar).toHaveBeenCalledWith(['foto-1']);
    expect(filaEnderecos.preencher).not.toHaveBeenCalled();
  });

  it('sem endereço na hora, agenda a busca para depois', async () => {
    const { registrar, endereco, filaEnderecos } = montar();
    endereco.executar.mockResolvedValue(null);

    await registrar.executar(pedido(), AGORA);

    expect(filaEnderecos.preencher).toHaveBeenCalledWith(ID);
  });

  it('o reenvio do mesmo autor devolve a gravada sem conferir mais nada', async () => {
    const { registrar, repositorio, uploads } = montar();
    repositorio.buscar.mockResolvedValue(GRAVADA);

    expect(await registrar.executar(pedido(), AGORA)).toEqual({
      criada: false,
      ocorrencia: GRAVADA,
    });
    expect(uploads.executar).not.toHaveBeenCalled();
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it('o id de outra pessoa dá 409 ID_EM_USO, também quando a corrida acontece na gravação', async () => {
    const { registrar, repositorio, filaFotos } = montar();
    repositorio.buscar.mockResolvedValueOnce({ ...GRAVADA, autorId: JOAO });

    await expect(registrar.executar(pedido(), AGORA)).rejects.toMatchObject({
      codigo: 'ID_EM_USO',
      status: 409,
    });

    repositorio.criar.mockResolvedValue({
      criada: false,
      ocorrencia: { ...GRAVADA, autorId: JOAO },
      fotoIds: [],
    });
    await expect(registrar.executar(pedido(), AGORA)).rejects.toMatchObject({
      codigo: 'ID_EM_USO',
    });
    expect(filaFotos.processar).not.toHaveBeenCalled();
  });

  it('categoria inativa e atributos fora do schema dão 422', async () => {
    const { registrar, repositorio } = montar();

    repositorio.categoriaAtiva.mockResolvedValueOnce(null);
    await expect(registrar.executar(pedido(), AGORA)).rejects.toMatchObject({
      codigo: 'CATEGORIA_INATIVA',
      status: 422,
    });

    repositorio.categoriaAtiva.mockResolvedValueOnce({
      id: 2,
      schemaAtributos: [
        {
          chave: 'numero_poste',
          rotulo: 'Número do poste',
          tipo: 'texto',
          obrigatorio: true,
          max: 20,
        },
      ],
    });
    await expect(registrar.executar(pedido({ atributos: {} }), AGORA)).rejects.toMatchObject({
      codigo: 'ATRIBUTOS_INVALIDOS',
      status: 422,
      detalhes: { campos: { 'atributos.numero_poste': ['Número do poste é obrigatório'] } },
    });
  });

  it('duas fotos com a mesma ordem dão 422 VALIDACAO', async () => {
    const { registrar } = montar();

    await expect(
      registrar.executar(
        pedido({
          fotos: [
            { uploadKey: `ocorrencias/${ID}/1-a.jpg`, ordem: 1 },
            { uploadKey: `ocorrencias/${ID}/1-b.jpg`, ordem: 1 },
          ],
        }),
        AGORA,
      ),
    ).rejects.toMatchObject({
      codigo: 'VALIDACAO',
      detalhes: { campos: { fotos: expect.any(Array) as string[] } },
    });
  });

  it('fora de um município ativo dá 422 FORA_DA_AREA', async () => {
    const { registrar, territorio } = montar();
    territorio.executar.mockResolvedValue(null);

    await expect(registrar.executar(pedido(), AGORA)).rejects.toMatchObject({
      codigo: 'FORA_DA_AREA',
      status: 422,
      message: 'O Fiscaliza Aí! ainda não atende esta região.',
    });
  });

  it('com candidata por perto, 409 DUPLICATA_POSSIVEL com o resumo e a distância arredondada', async () => {
    const { registrar, repositorio } = montar();
    repositorio.candidatasDuplicidade.mockResolvedValue([
      {
        id: 'outra',
        protocolo: 'FA-2026-SOR-000007',
        descricao: 'x'.repeat(200),
        distanciaM: 42.6,
        confirmacoes: 3,
      },
    ]);

    await expect(registrar.executar(pedido(), AGORA)).rejects.toMatchObject({
      codigo: 'DUPLICATA_POSSIVEL',
      status: 409,
      detalhes: {
        candidatas: [
          {
            id: 'outra',
            protocolo: 'FA-2026-SOR-000007',
            resumo: `${'x'.repeat(119)}…`,
            distancia_m: 43,
            confirmacoes: 3,
          },
        ],
      },
    });
    expect(repositorio.candidatasDuplicidade).toHaveBeenCalledWith({
      categoriaId: 2,
      local: { lat: -23.5015, lng: -47.4526 },
      raioM: 60,
      limite: 3,
    });
    expect(repositorio.criar).not.toHaveBeenCalled();
  });

  it.each([
    ['a pendente enviada depois', { origem: 'OFFLINE' as const }],
    ['"É outro problema"', { forcarCriacao: true }],
  ])('%s não passa pela duplicidade', async (_caso, mudancas) => {
    const { registrar, repositorio } = montar();

    await registrar.executar(pedido(mudancas), AGORA);

    expect(repositorio.candidatasDuplicidade).not.toHaveBeenCalled();
    expect(repositorio.criar).toHaveBeenCalledOnce();
  });
});
