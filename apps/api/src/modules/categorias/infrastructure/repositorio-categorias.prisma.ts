import { Injectable } from '@nestjs/common';

import { Prisma, type Categoria as CategoriaPrisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { CampoAtributo } from '../../ocorrencias/domain/schema-atributos.js';
import { erroSlugEmUso } from '../application/erros.js';
import type { Categoria, DadosCategoria, RepositorioCategorias } from '../application/portas.js';

@Injectable()
export class RepositorioCategoriasPrisma implements RepositorioCategorias {
  constructor(private readonly prisma: PrismaService) {}

  async listar(): Promise<Categoria[]> {
    const categorias = await this.prisma.categoria.findMany({ orderBy: [{ nome: 'asc' }] });
    return categorias.map(paraCategoria);
  }

  async buscar(id: number): Promise<Categoria | null> {
    const categoria = await this.prisma.categoria.findUnique({ where: { id } });
    return categoria && paraCategoria(categoria);
  }

  criar(dados: DadosCategoria): Promise<Categoria> {
    return comSlugUnico(async () =>
      paraCategoria(await this.prisma.categoria.create({ data: paraBanco(dados) })),
    );
  }

  atualizar(id: number, dados: Partial<DadosCategoria>): Promise<Categoria | null> {
    return comSlugUnico(async () => {
      const { count } = await this.prisma.categoria.updateMany({
        where: { id },
        data: paraBanco(dados),
      });
      return count ? this.buscar(id) : null;
    });
  }
}

async function comSlugUnico<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
      throw erroSlugEmUso();
    }
    throw erro;
  }
}

function paraBanco<T extends Partial<DadosCategoria>>(
  dados: T,
): Omit<T, 'schemaAtributos'> & { schemaAtributos?: Prisma.InputJsonValue } {
  const { schemaAtributos, ...resto } = dados;
  return schemaAtributos === undefined ? resto : { ...resto, schemaAtributos };
}

function paraCategoria(categoria: CategoriaPrisma): Categoria {
  return {
    id: categoria.id,
    slug: categoria.slug,
    nome: categoria.nome,
    icone: categoria.icone,
    slaDias: categoria.slaDias,
    // O schema é validado ao salvar a categoria.
    schemaAtributos: categoria.schemaAtributos as unknown as CampoAtributo[],
    ativa: categoria.ativa,
  };
}
