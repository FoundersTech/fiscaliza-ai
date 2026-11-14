import { Module } from '@nestjs/common';

import { AlterarAgente, ConvidarAgente, ListarAgentes } from './application/agentes.js';
import { ConvidarGestor } from './application/gestores.js';
import { EditarOrgao, ObterOrgao } from './application/orgao.js';
import { REPOSITORIO_ADMINISTRACAO } from './application/portas.js';
import { RepositorioAdministracaoPrisma } from './infrastructure/repositorio-administracao.prisma.js';
import {
  AgentesController,
  GestoresController,
  OrgaoController,
} from './presentation/admin.controller.js';

/** Órgão do município, agentes e gestores. As contas nascem por convite, pela identidade. */
@Module({
  controllers: [OrgaoController, AgentesController, GestoresController],
  providers: [
    ObterOrgao,
    EditarOrgao,
    ListarAgentes,
    ConvidarAgente,
    AlterarAgente,
    ConvidarGestor,
    { provide: REPOSITORIO_ADMINISTRACAO, useClass: RepositorioAdministracaoPrisma },
  ],
})
export class AdministracaoModule {}
