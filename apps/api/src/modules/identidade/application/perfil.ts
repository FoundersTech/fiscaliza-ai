import type { Papel } from '../domain/papel.js';
import type { Usuario } from './portas.js';

export interface Perfil {
  id: string;
  nome: string;
  apelidoPublico: string;
  email: string;
  papel: Papel;
  municipioId: number | null;
  orgaoId: number | null;
  precisaAceitarPolitica: boolean;
}

export interface Sessao {
  accessToken: string;
  usuario: Perfil;
  refresh: { token: string; expiraEm: Date };
}

export function montarPerfil(usuario: Usuario, politicaVigente: string): Perfil {
  return {
    id: usuario.usuarioId,
    nome: usuario.nome,
    apelidoPublico: usuario.apelidoPublico,
    email: usuario.email,
    papel: usuario.papel,
    municipioId: usuario.municipioId,
    orgaoId: usuario.orgaoId,
    precisaAceitarPolitica: usuario.politicaVersao !== politicaVigente,
  };
}

export function podeEntrar(usuario: Usuario): usuario is Usuario & { senhaHash: string } {
  return usuario.ativo && usuario.anonimizadoEm === null && usuario.senhaHash !== null;
}
