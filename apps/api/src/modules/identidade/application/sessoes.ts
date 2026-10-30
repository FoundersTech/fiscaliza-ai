import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { erroSessaoInvalida } from './erros.js';
import { montarPerfil, podeEntrar, type Sessao } from './perfil.js';
import {
  EMISSOR_TOKEN,
  type EmissorToken,
  type NovoRefresh,
  type Origem,
  REPOSITORIO_SESSOES,
  REPOSITORIO_USUARIOS,
  type RepositorioSessoes,
  type RepositorioUsuarios,
  type Usuario,
} from './portas.js';
import { gerarSegredo, resumirSegredo } from './segredo.js';

export const DURACAO_REFRESH_DIAS = 30;
export const TOLERANCIA_REUSO_MS = 10_000;

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function novoRefresh(
  usuarioId: string,
  familiaId: string,
  origem: Origem,
  agora: Date,
): { token: string; dados: NovoRefresh } {
  const token = gerarSegredo();
  const expiraEm = new Date(agora.getTime() + DURACAO_REFRESH_DIAS * UM_DIA_MS);
  return {
    token,
    dados: { usuarioId, familiaId, tokenHash: resumirSegredo(token), expiraEm, ...origem },
  };
}

@Injectable()
export class AbrirSessao {
  constructor(
    @Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(usuario: Usuario, origem: Origem, agora = new Date()): Promise<Sessao> {
    const { token, dados } = novoRefresh(usuario.usuarioId, randomUUID(), origem, agora);
    await this.sessoes.criar(dados);
    return {
      accessToken: await this.tokens.emitir(usuario),
      usuario: montarPerfil(usuario, this.ambiente.POLITICA_VERSAO),
      refresh: { token, expiraEm: dados.expiraEm },
    };
  }
}

@Injectable()
export class RenovarSessao {
  constructor(
    @Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes,
    @Inject(REPOSITORIO_USUARIOS) private readonly usuarios: RepositorioUsuarios,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(token: string | undefined, origem: Origem, agora = new Date()): Promise<Sessao> {
    const atual = token ? await this.sessoes.buscarPorHash(resumirSegredo(token)) : null;
    if (!atual || atual.revogadoEm || atual.expiraEm <= agora) {
      throw erroSessaoInvalida();
    }
    if (atual.usadoEm && agora.getTime() - atual.usadoEm.getTime() > TOLERANCIA_REUSO_MS) {
      await this.sessoes.revogarFamilia(atual.familiaId, agora);
      throw erroSessaoInvalida();
    }

    const usuario = await this.usuarios.buscarPorId(atual.usuarioId);
    if (!usuario || !podeEntrar(usuario)) {
      await this.sessoes.revogarFamilia(atual.familiaId, agora);
      throw erroSessaoInvalida();
    }

    const sucessor = novoRefresh(atual.usuarioId, atual.familiaId, origem, agora);
    // Dentro da tolerância (ou se outra aba girou no mesmo instante), a família ganha mais um token
    // em vez de ser revogada.
    const girou =
      !atual.usadoEm && (await this.sessoes.rotacionar(atual.id, sucessor.dados, agora));
    if (!girou) {
      await this.sessoes.criar(sucessor.dados);
    }

    return {
      accessToken: await this.tokens.emitir(usuario),
      usuario: montarPerfil(usuario, this.ambiente.POLITICA_VERSAO),
      refresh: { token: sucessor.token, expiraEm: sucessor.dados.expiraEm },
    };
  }
}

@Injectable()
export class Sair {
  constructor(@Inject(REPOSITORIO_SESSOES) private readonly sessoes: RepositorioSessoes) {}

  async executar(token: string | undefined, agora = new Date()): Promise<void> {
    const atual = token ? await this.sessoes.buscarPorHash(resumirSegredo(token)) : null;
    if (atual && !atual.revogadoEm) {
      await this.sessoes.revogarFamilia(atual.familiaId, agora);
    }
  }
}
