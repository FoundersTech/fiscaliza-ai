import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroEmailEmUso, erroPoliticaDesatualizada } from './erros.js';
import { montarPerfil, type Sessao } from './perfil.js';
import {
  EMISSOR_TOKEN,
  type EmissorToken,
  HASHER_SENHA,
  type HasherSenha,
  REPOSITORIO_USUARIOS,
  type RepositorioUsuarios,
} from './portas.js';

export interface DadosCadastro {
  nome: string;
  apelidoPublico: string;
  email: string;
  senha: string;
  politicaVersao: string;
}

/** Cadastro público: sempre cria um CIDADAO; os outros papéis nascem por convite. */
@Injectable()
export class Cadastrar {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(dados: DadosCadastro, agora = new Date()): Promise<Sessao> {
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

    return {
      accessToken: await this.tokens.emitir(usuario),
      usuario: montarPerfil(usuario, this.ambiente.POLITICA_VERSAO),
    };
  }
}
