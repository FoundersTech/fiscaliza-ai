import { Module } from '@nestjs/common';

import { CriarCategoria, EditarCategoria, ListarCategorias } from './application/categorias.js';
import { REPOSITORIO_CATEGORIAS } from './application/portas.js';
import { RepositorioCategoriasPrisma } from './infrastructure/repositorio-categorias.prisma.js';
import { CategoriasController } from './presentation/categorias.controller.js';

/** Cadastro das categorias pelo administrador da plataforma. */
@Module({
  controllers: [CategoriasController],
  providers: [
    ListarCategorias,
    CriarCategoria,
    EditarCategoria,
    { provide: REPOSITORIO_CATEGORIAS, useClass: RepositorioCategoriasPrisma },
  ],
})
export class CategoriasModule {}
