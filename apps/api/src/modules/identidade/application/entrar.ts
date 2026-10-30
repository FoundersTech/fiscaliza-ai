import { Inject, Injectable } from '@nestjs/common';

import { erroCredenciaisInvalidas } from './erros.js';
import { podeEntrar, type Sessao } from './perfil.js';
import {
  HASHER_SENHA,
  type HasherSenha,
  type Origem,
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from './portas.js';
import { AbrirSessao } from './sessoes.js';

@Injectable()
export class Entrar {
  private hashFicticio?: Promise<string>;

  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
    private readonly abrirSessao: AbrirSessao,
  ) {}

  async executar(email: string, senha: string, origem: Origem): Promise<Sessao> {
    const usuario = await this.usuarios.buscarPorEmail(email);

    if (!usuario || !podeEntrar(usuario)) {
      this.hashFicticio ??= this.hasher.gerar('senha-que-nunca-confere');
      await this.hasher.conferir(await this.hashFicticio, senha);
      throw erroCredenciaisInvalidas();
    }
    if (!(await this.hasher.conferir(usuario.senhaHash, senha))) {
      throw erroCredenciaisInvalidas();
    }

    return this.abrirSessao.executar(usuario, origem);
  }
}
