import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroNaoAutenticado, erroPoliticaDesatualizada, erroPoliticaPendente } from './erros.js';
import { podeEntrar, precisaAceitarPolitica } from './perfil.js';
import { REPOSITORIO_USUARIOS, type RepositorioUsuarios } from './portas.js';

/**
 * Conferência de cada requisição logada, além do token: a conta ainda pode entrar e aceitou a
 * versão vigente da política. Quando a política muda, o token continua valendo, mas as ações
 * ficam bloqueadas até o novo aceite.
 */
@Injectable()
export class ConferirAcesso {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(usuarioId: string, exigirPolitica: boolean): Promise<void> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario || !podeEntrar(usuario)) {
      throw erroNaoAutenticado();
    }
    if (exigirPolitica && precisaAceitarPolitica(usuario, this.ambiente.POLITICA_VERSAO)) {
      throw erroPoliticaPendente(this.ambiente.POLITICA_VERSAO);
    }
  }
}

@Injectable()
export class AceitarPolitica {
  constructor(
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  /** Só a versão vigente é aceita: o PWA pode estar mostrando um texto antigo. */
  async executar(usuarioId: string, versao: string, agora = new Date()): Promise<void> {
    if (versao !== this.ambiente.POLITICA_VERSAO) {
      throw erroPoliticaDesatualizada(this.ambiente.POLITICA_VERSAO);
    }
    await this.usuarios.registrarAceitePolitica(usuarioId, versao, agora);
  }
}
