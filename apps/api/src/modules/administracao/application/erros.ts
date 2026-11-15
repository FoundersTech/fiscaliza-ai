import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';

export function erroOutroMunicipio(): ErroAplicacao {
  return new ErroAplicacao('OUTRO_MUNICIPIO', 'Este cadastro é de outro município.', 403);
}

/** Falha da carga inicial: todo município ativo tem o seu órgão. */
export function erroMunicipioSemOrgao(): ErroAplicacao {
  return new ErroAplicacao(
    'MUNICIPIO_SEM_ORGAO',
    'O município ainda não tem órgão cadastrado.',
    422,
  );
}

export function erroAgenteNaoEncontrado(): ErroAplicacao {
  return new ErroAplicacao('NAO_ENCONTRADO', 'Agente não encontrado.', 404);
}

export function erroMunicipioInexistente(): ErroAplicacao {
  return new ErroAplicacao('MUNICIPIO_INEXISTENTE', 'Município não cadastrado.', 422);
}
