import { Inject, Injectable } from '@nestjs/common';

import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { ConferirUploads, FilaFotos } from '../../midia/application/fotos-enviadas.js';
import { EnderecoReverso, ResolverTerritorio } from '../../territorio/application/territorio.js';
import type { Ponto } from '../../territorio/domain/endereco.js';
import { type Atributos, SchemaAtributos } from '../domain/schema-atributos.js';
import { FilaEnderecos } from './enderecos.js';
import {
  type CandidataDuplicidade,
  type OcorrenciaGravada,
  REPOSITORIO_OCORRENCIAS,
  type RepositorioOcorrencias,
} from './portas.js';

/** Quantas candidatas a duplicata o PWA mostra antes de criar. */
const LIMITE_CANDIDATAS = 3;

export type Origem = 'ONLINE' | 'OFFLINE';

export interface PedidoRegistro {
  id: string;
  autorId: string;
  categoriaId: number;
  descricao: string;
  atributos: unknown;
  local: Ponto;
  precisaoM: number | null;
  publicarAutor: boolean;
  fotos: { uploadKey: string; ordem: number }[];
  origem: Origem;
  forcarCriacao: boolean;
}

export interface Registro {
  /** Falso quando o mesmo autor reenviou uma ocorrência já gravada. */
  criada: boolean;
  ocorrencia: OcorrenciaGravada;
}

@Injectable()
export class RegistrarOcorrencia {
  constructor(
    @Inject(REPOSITORIO_OCORRENCIAS) private readonly ocorrencias: RepositorioOcorrencias,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
    private readonly resolverTerritorio: ResolverTerritorio,
    private readonly enderecoReverso: EnderecoReverso,
    private readonly conferirUploads: ConferirUploads,
    private readonly filaFotos: FilaFotos,
    private readonly filaEnderecos: FilaEnderecos,
  ) {}

  async executar(pedido: PedidoRegistro, agora = new Date()): Promise<Registro> {
    // Reenvio vem primeiro: os originais das fotos já podem ter sido apagados.
    const existente = await this.ocorrencias.buscar(pedido.id);
    if (existente) return this.reenvio(existente, pedido.autorId);

    const atributos = await this.validarCategoria(pedido.categoriaId, pedido.atributos);
    validarOrdens(pedido.fotos);
    await this.conferirUploads.executar(
      pedido.id,
      pedido.fotos.map((foto) => foto.uploadKey),
    );

    const territorio = await this.resolverTerritorio.executar(pedido.local);
    if (!territorio) {
      throw new ErroAplicacao('FORA_DA_AREA', 'O Fiscaliza Aí! ainda não atende esta região.', 422);
    }

    // Quem envia uma pendente não está mais no local para escolher: o agente marca depois.
    if (pedido.origem === 'ONLINE' && !pedido.forcarCriacao) {
      const candidatas = await this.ocorrencias.candidatasDuplicidade({
        categoriaId: pedido.categoriaId,
        local: pedido.local,
        raioM: this.parametros.duplicidade_raio_m,
        limite: LIMITE_CANDIDATAS,
      });
      if (candidatas.length) throw erroDuplicata(candidatas);
    }

    const endereco = await this.enderecoReverso.executar(pedido.local);
    const resultado = await this.ocorrencias.criar({
      id: pedido.id,
      autorId: pedido.autorId,
      publicarAutor: pedido.publicarAutor,
      categoriaId: pedido.categoriaId,
      municipioId: territorio.municipioId,
      municipioSigla: territorio.municipioSigla,
      orgaoId: territorio.orgaoId,
      descricao: pedido.descricao,
      atributos,
      local: pedido.local,
      precisaoM: pedido.precisaoM,
      endereco,
      fotos: pedido.fotos,
      criadaEm: agora,
    });
    if (!resultado.criada) return this.reenvio(resultado.ocorrencia, pedido.autorId);

    await this.filaFotos.processar(resultado.fotoIds);
    if (!endereco) await this.filaEnderecos.preencher(pedido.id);
    return { criada: true, ocorrencia: resultado.ocorrencia };
  }

  private reenvio(existente: OcorrenciaGravada, autorId: string): Registro {
    if (existente.autorId !== autorId) {
      throw new ErroAplicacao(
        'ID_EM_USO',
        'Este identificador já pertence a outra ocorrência. Gere outro e envie de novo.',
        409,
      );
    }
    return { criada: false, ocorrencia: existente };
  }

  private async validarCategoria(categoriaId: number, atributos: unknown): Promise<Atributos> {
    const categoria = await this.ocorrencias.categoriaAtiva(categoriaId);
    if (!categoria) {
      throw new ErroAplicacao('CATEGORIA_INATIVA', 'Categoria indisponível, escolha outra.', 422);
    }
    try {
      return SchemaAtributos.criar(categoria.schemaAtributos).validar(atributos);
    } catch (erro) {
      if (erro instanceof ErroDominio && erro.codigo === 'ATRIBUTOS_INVALIDOS') {
        throw new ErroAplicacao(erro.codigo, erro.message, 422, erro.detalhes);
      }
      throw erro;
    }
  }
}

function validarOrdens(fotos: PedidoRegistro['fotos']): void {
  if (new Set(fotos.map((foto) => foto.ordem)).size !== fotos.length) {
    throw new ErroAplicacao('VALIDACAO', 'Dados inválidos.', 422, {
      campos: { fotos: ['cada foto precisa de uma ordem diferente'] },
    });
  }
}

const TAMANHO_RESUMO = 120;

function erroDuplicata(candidatas: CandidataDuplicidade[]): ErroAplicacao {
  return new ErroAplicacao(
    'DUPLICATA_POSSIVEL',
    'Já existe uma ocorrência parecida perto daqui.',
    409,
    {
      candidatas: candidatas.map((candidata) => ({
        id: candidata.id,
        protocolo: candidata.protocolo,
        resumo:
          candidata.descricao.length > TAMANHO_RESUMO
            ? `${candidata.descricao.slice(0, TAMANHO_RESUMO - 1).trimEnd()}…`
            : candidata.descricao,
        distancia_m: Math.round(candidata.distanciaM),
        confirmacoes: candidata.confirmacoes,
      })),
    },
  );
}
