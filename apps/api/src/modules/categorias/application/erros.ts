import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';

export function erroSlugEmUso(): ErroAplicacao {
  return new ErroAplicacao('SLUG_EM_USO', 'Já existe uma categoria com este slug.', 409);
}

export function erroCategoriaNaoEncontrada(): ErroAplicacao {
  return new ErroAplicacao('NAO_ENCONTRADA', 'Categoria não encontrada.', 404);
}
