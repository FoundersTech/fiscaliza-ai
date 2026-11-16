import type { DestinoPush } from './push.port.js';

export const REPOSITORIO_PUSH = Symbol('REPOSITORIO_PUSH');

/** Uma inscrição de push gravada: um navegador de um usuário. */
export interface InscricaoPush extends DestinoPush {
  id: string;
  usuarioId: string;
}

export interface RepositorioPush {
  /**
   * Grava a inscrição pelo endpoint. Se o endpoint já existir, passa a ser deste usuário (o mesmo
   * navegador com outra conta), com as chaves novas e sem o último erro.
   */
  salvar(usuarioId: string, destino: DestinoPush): Promise<void>;
  /** Apaga a inscrição do usuário com esse endpoint; sem erro se ela não existir. */
  removerDoUsuario(usuarioId: string, endpoint: string): Promise<void>;
  /** As inscrições de todos esses usuários. */
  dosUsuarios(usuarioIds: string[]): Promise<InscricaoPush[]>;
  /** Apaga a inscrição que o serviço de push deu como expirada. */
  apagar(id: string): Promise<void>;
  /** Guarda quando o envio para a inscrição falhou. */
  registrarErro(id: string, quando: Date): Promise<void>;
}
