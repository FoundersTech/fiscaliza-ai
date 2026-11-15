import { Inject, Injectable } from '@nestjs/common';

import { erroAcessoNegado } from '../../identidade/application/erros.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { erroMunicipioSemOrgao } from './erros.js';
import { type Orgao, REPOSITORIO_ADMINISTRACAO, type RepositorioAdministracao } from './portas.js';

/**
 * O órgão do município do gestor. O município vem sempre do token: não há como pedir o órgão
 * de outro município.
 */
export async function orgaoDoGestor(
  repositorio: RepositorioAdministracao,
  gestor: DadosToken,
): Promise<Orgao> {
  if (gestor.municipioId === null) throw erroAcessoNegado();
  const orgao = await repositorio.buscarOrgaoDoMunicipio(gestor.municipioId);
  if (!orgao) throw erroMunicipioSemOrgao();
  return orgao;
}

@Injectable()
export class ObterOrgao {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
  ) {}

  executar(gestor: DadosToken): Promise<Orgao> {
    return orgaoDoGestor(this.repositorio, gestor);
  }
}

/** Só nome e sigla mudam; o órgão continua sendo o único do município. */
@Injectable()
export class EditarOrgao {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
  ) {}

  async executar(gestor: DadosToken, dados: { nome?: string; sigla?: string }): Promise<Orgao> {
    const orgao = await orgaoDoGestor(this.repositorio, gestor);
    if (dados.nome === undefined && dados.sigla === undefined) return orgao;
    return this.repositorio.atualizarOrgao(orgao.id, dados);
  }
}
