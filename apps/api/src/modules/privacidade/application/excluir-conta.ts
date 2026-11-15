import { Inject, Injectable, Logger } from '@nestjs/common';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import { HASHER_SENHA, type HasherSenha } from '../../identidade/application/portas.js';
import {
  ARQUIVOS_EXPORTACAO,
  type ArquivosExportacao,
  REPOSITORIO_CONTAS,
  type RepositorioContas,
} from './portas.js';

export function erroSenhaIncorreta(): ErroAplicacao {
  return new ErroAplicacao('SENHA_INCORRETA', 'Senha incorreta.', 401);
}

@Injectable()
export class ExcluirConta {
  private readonly logger = new Logger(ExcluirConta.name);

  constructor(
    @Inject(REPOSITORIO_CONTAS) private readonly contas: RepositorioContas,
    @Inject(HASHER_SENHA) private readonly hasher: HasherSenha,
    @Inject(ARQUIVOS_EXPORTACAO) private readonly arquivos: ArquivosExportacao,
  ) {}

  /**
   * Confere a senha e anonimiza a conta. As ocorrências continuam públicas, sem autor; as
   * confirmações e avaliações ficam com o usuário anonimizado, para manter contagens e score.
   */
  async executar(usuarioId: string, senha: string, agora = new Date()): Promise<void> {
    const hash = await this.contas.senhaDe(usuarioId);
    if (!hash || !(await this.hasher.conferir(hash, senha))) throw erroSenhaIncorreta();

    const arquivos = await this.contas.anonimizar(usuarioId, agora);
    // Depois do commit: um arquivo que não sair agora fica sem dono no bucket, mas a conta já
    // está anonimizada, e ninguém mais tem como baixá-lo.
    for (const chave of arquivos) {
      try {
        await this.arquivos.apagar(chave);
      } catch (erro) {
        this.logger.warn(`Arquivo de exportação ${chave} não foi apagado: ${String(erro)}`);
      }
    }
  }
}
