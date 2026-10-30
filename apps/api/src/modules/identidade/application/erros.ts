import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';

export function erroEmailEmUso(): ErroAplicacao {
  return new ErroAplicacao('EMAIL_EM_USO', 'Já existe uma conta com este e-mail.', 409);
}

export function erroCredenciaisInvalidas(): ErroAplicacao {
  return new ErroAplicacao('CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.', 401);
}

export function erroPoliticaDesatualizada(vigente: string): ErroAplicacao {
  return new ErroAplicacao(
    'POLITICA_DESATUALIZADA',
    'Aceite a versão atual da política de privacidade.',
    422,
    { versao_vigente: vigente },
  );
}

export function erroNaoAutenticado(): ErroAplicacao {
  return new ErroAplicacao('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Entre de novo.', 401);
}

export function erroAcessoNegado(): ErroAplicacao {
  return new ErroAplicacao('ACESSO_NEGADO', 'Você não tem permissão para esta ação.', 403);
}
