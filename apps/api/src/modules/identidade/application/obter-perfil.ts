import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroNaoAutenticado } from './erros.js';
import { montarPerfil, type Perfil, podeEntrar } from './perfil.js';
import { REPOSITORIO_USUARIOS, type RepositorioUsuarios } from './portas.js';

@Injectable()
export class ObterPerfil {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  /** Uma conta desativada ou anonimizada depois do login perde o acesso aqui. */
  async executar(usuarioId: string): Promise<Perfil> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario || !podeEntrar(usuario)) {
      throw erroNaoAutenticado();
    }
    return montarPerfil(usuario, this.ambiente.POLITICA_VERSAO);
  }
}
