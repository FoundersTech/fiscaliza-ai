import { Inject, Injectable } from '@nestjs/common';

import { AlterarAtivacaoConta, ConvidarUsuario } from '../../identidade/application/contas.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { erroAgenteNaoEncontrado, erroOutroMunicipio } from './erros.js';
import { orgaoDoGestor } from './orgao.js';
import { type Agente, REPOSITORIO_ADMINISTRACAO, type RepositorioAdministracao } from './portas.js';

@Injectable()
export class ListarAgentes {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
  ) {}

  async executar(gestor: DadosToken): Promise<Agente[]> {
    const orgao = await orgaoDoGestor(this.repositorio, gestor);
    return this.repositorio.listarAgentes(orgao.id);
  }
}

/** Cria o agente no órgão do município do gestor, sem senha, e envia o convite. */
@Injectable()
export class ConvidarAgente {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
    private readonly convidar: ConvidarUsuario,
  ) {}

  async executar(
    gestor: DadosToken,
    dados: { nome: string; email: string },
    agora = new Date(),
  ): Promise<Agente> {
    const orgao = await orgaoDoGestor(this.repositorio, gestor);
    const usuario = await this.convidar.executar(
      {
        nome: dados.nome,
        email: dados.email,
        papel: Papel.AGENTE_ORGAO,
        municipioId: orgao.municipioId,
        orgaoId: orgao.id,
        nomeOrgao: orgao.nome,
      },
      agora,
    );
    return {
      id: usuario.usuarioId,
      nome: usuario.nome,
      email: usuario.email,
      orgaoId: orgao.id,
      ativo: usuario.ativo,
      convitePendente: true,
    };
  }
}

/**
 * Ativa ou desativa um agente do órgão do gestor. Agente de outro órgão (logo, de outro
 * município) recebe 403, mesmo que o id exista.
 */
@Injectable()
export class AlterarAgente {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
    private readonly alterarAtivacao: AlterarAtivacaoConta,
  ) {}

  async executar(
    gestor: DadosToken,
    agenteId: string,
    dados: { ativo: boolean },
    agora = new Date(),
  ): Promise<Agente> {
    const orgao = await orgaoDoGestor(this.repositorio, gestor);
    const agente = await this.repositorio.buscarAgente(agenteId);
    if (!agente) throw erroAgenteNaoEncontrado();
    if (agente.orgaoId !== orgao.id) throw erroOutroMunicipio();

    if (agente.ativo !== dados.ativo) {
      await this.alterarAtivacao.executar(agente.id, dados.ativo, agora);
    }
    return { ...agente, ativo: dados.ativo };
  }
}
