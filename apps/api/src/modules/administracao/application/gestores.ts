import { Inject, Injectable } from '@nestjs/common';

import { ConvidarUsuario } from '../../identidade/application/contas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { erroMunicipioInexistente } from './erros.js';
import { type Gestor, REPOSITORIO_ADMINISTRACAO, type RepositorioAdministracao } from './portas.js';

/** O admin da plataforma cria o gestor (ADMIN_MUNICIPIO) de um município, por convite. */
@Injectable()
export class ConvidarGestor {
  constructor(
    @Inject(REPOSITORIO_ADMINISTRACAO) private readonly repositorio: RepositorioAdministracao,
    private readonly convidar: ConvidarUsuario,
  ) {}

  async executar(
    dados: { nome: string; email: string; municipioId: number },
    agora = new Date(),
  ): Promise<Gestor> {
    if (!(await this.repositorio.municipioExiste(dados.municipioId))) {
      throw erroMunicipioInexistente();
    }
    const usuario = await this.convidar.executar(
      {
        nome: dados.nome,
        email: dados.email,
        papel: Papel.ADMIN_MUNICIPIO,
        municipioId: dados.municipioId,
      },
      agora,
    );
    return {
      id: usuario.usuarioId,
      nome: usuario.nome,
      email: usuario.email,
      municipioId: dados.municipioId,
    };
  }
}
