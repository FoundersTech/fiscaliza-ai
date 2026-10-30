import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroCredenciaisInvalidas } from './erros.js';
import { montarPerfil, podeEntrar, type Sessao } from './perfil.js';
import {
  EMISSOR_TOKEN,
  type EmissorToken,
  HASHER_SENHA,
  type HasherSenha,
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from './portas.js';

@Injectable()
export class Entrar {
  /** Hash de uma senha qualquer */
  private hashFicticio?: Promise<string>;

  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(email: string, senha: string): Promise<Sessao> {
    const usuario = await this.usuarios.buscarPorEmail(email);

    if (!usuario || !podeEntrar(usuario)) {
      this.hashFicticio ??= this.hasher.gerar('senha-que-nunca-confere');
      await this.hasher.conferir(await this.hashFicticio, senha);
      throw erroCredenciaisInvalidas();
    }
    if (!(await this.hasher.conferir(usuario.senhaHash, senha))) {
      throw erroCredenciaisInvalidas();
    }

    return {
      accessToken: await this.tokens.emitir(usuario),
      usuario: montarPerfil(usuario, this.ambiente.POLITICA_VERSAO),
    };
  }
}
