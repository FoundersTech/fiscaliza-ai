import { Inject, Injectable } from '@nestjs/common';

import { ErroDominio } from '../../../shared/dominio/erro-dominio.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { type CampoAtributo, SchemaAtributos } from '../../ocorrencias/domain/schema-atributos.js';
import { erroCategoriaNaoEncontrada } from './erros.js';
import {
  type Categoria,
  type DadosCategoria,
  REPOSITORIO_CATEGORIAS,
  type RepositorioCategorias,
} from './portas.js';

/** O mesmo schema que o registro de ocorrência usa para validar os atributos, já normalizado. */
function validarSchema(json: unknown): CampoAtributo[] {
  try {
    return [...SchemaAtributos.criar(json).campos];
  } catch (erro) {
    if (erro instanceof ErroDominio && erro.codigo === 'SCHEMA_INVALIDO') {
      throw new ErroAplicacao(erro.codigo, erro.message, 422, erro.detalhes);
    }
    throw erro;
  }
}

export type NovaCategoria = Omit<DadosCategoria, 'schemaAtributos' | 'ativa'> & {
  schemaAtributos: unknown;
  ativa?: boolean;
};

export type EdicaoCategoria = Partial<Omit<NovaCategoria, 'schemaAtributos'>> & {
  schemaAtributos?: unknown;
};

@Injectable()
export class ListarCategorias {
  constructor(
    @Inject(REPOSITORIO_CATEGORIAS) private readonly repositorio: RepositorioCategorias,
  ) {}

  executar(): Promise<Categoria[]> {
    return this.repositorio.listar();
  }
}

@Injectable()
export class CriarCategoria {
  constructor(
    @Inject(REPOSITORIO_CATEGORIAS) private readonly repositorio: RepositorioCategorias,
  ) {}

  async executar(nova: NovaCategoria): Promise<Categoria> {
    return this.repositorio.criar({
      ...nova,
      schemaAtributos: validarSchema(nova.schemaAtributos),
      ativa: nova.ativa ?? true,
    });
  }
}

/**
 * Só os campos enviados mudam. Inativar não apaga nada: a categoria sai do registro de novas
 * ocorrências, e as que já existem continuam com ela.
 */
@Injectable()
export class EditarCategoria {
  constructor(
    @Inject(REPOSITORIO_CATEGORIAS) private readonly repositorio: RepositorioCategorias,
  ) {}

  async executar(id: number, edicao: EdicaoCategoria): Promise<Categoria> {
    if (!idValido(id)) throw erroCategoriaNaoEncontrada();
    // Campo ausente ou nulo fica como está.
    const { schemaAtributos, ...resto } = edicao;
    const dados = Object.fromEntries(
      Object.entries(resto).filter(([, valor]) => valor !== undefined && valor !== null),
    ) as Partial<DadosCategoria>;
    if (schemaAtributos !== undefined && schemaAtributos !== null)
      dados.schemaAtributos = validarSchema(schemaAtributos);

    const categoria = Object.keys(dados).length
      ? await this.repositorio.atualizar(id, dados)
      : await this.repositorio.buscar(id);
    if (!categoria) throw erroCategoriaNaoEncontrada();
    return categoria;
  }
}

/** O id da categoria é um smallint. */
function idValido(id: number): boolean {
  return Number.isInteger(id) && id >= 1 && id <= 32_767;
}
