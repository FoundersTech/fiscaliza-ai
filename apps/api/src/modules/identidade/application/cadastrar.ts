import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroEmailEmUso, erroPoliticaDesatualizada } from './erros.js';
import type { Sessao } from './perfil.js';
import {
  HASHER_SENHA,
  type HasherSenha,
  type Origem,
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from './portas.js';
import { AbrirSessao } from './sessoes.js';

export interface DadosCadastro {
  nome: string;
  apelidoPublico: string;
  email: string;
  senha: string;
  politicaVersao: string;
}

/** Cadastro público: sempre cria um CIDADAO; os outros papéis são criados por convite. */
@Injectable()
export class Cadastrar {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
    private readonly abrirSessao: AbrirSessao,
  ) {}

  async executar(dados: DadosCadastro, origem: Origem, agora = new Date()): Promise<Sessao> {
    if (dados.politicaVersao !== this.ambiente.POLITICA_VERSAO) {
      throw erroPoliticaDesatualizada(this.ambiente.POLITICA_VERSAO);
    }
    if (await this.usuarios.buscarPorEmail(dados.email)) {
      throw erroEmailEmUso();
    }

    const usuario = await this.usuarios.criarCidadao({
      nome: dados.nome,
      apelidoPublico: dados.apelidoPublico,
      email: dados.email,
      senhaHash: await this.hasher.gerar(dados.senha),
      politicaVersao: dados.politicaVersao,
      politicaAceitaEm: agora,
    });

    return this.abrirSessao.executar(usuario, origem, agora);
  }
}
