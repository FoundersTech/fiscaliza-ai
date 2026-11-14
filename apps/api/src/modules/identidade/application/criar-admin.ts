import { Injectable } from '@nestjs/common';

import { Papel } from '../domain/papel.js';
import { ConvidarUsuario } from './contas.js';
import type { Usuario } from './portas.js';

const NOME_ADMIN_PADRAO = 'Administração da plataforma';

/**
 * Cria um ADMIN_PLATAFORMA sem senha e envia o convite para ele definir a própria. Assim
 * nenhuma senha passa por variável de ambiente nem pelo terminal.
 */
@Injectable()
export class CriarAdminPlataforma {
  constructor(private readonly convidar: ConvidarUsuario) {}

  executar(dados: { email: string; nome?: string }, agora = new Date()): Promise<Usuario> {
    return this.convidar.executar(
      {
        nome: dados.nome ?? NOME_ADMIN_PADRAO,
        apelidoPublico: 'admin',
        email: dados.email,
        papel: Papel.ADMIN_PLATAFORMA,
      },
      agora,
    );
  }
}
