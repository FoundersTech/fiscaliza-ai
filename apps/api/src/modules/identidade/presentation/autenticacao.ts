import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { erroAcessoNegado, erroNaoAutenticado } from '../application/erros.js';
import { type DadosToken, EMISSOR_TOKEN, type EmissorToken } from '../application/portas.js';
import type { Papel } from '../domain/papel.js';

const PAPEIS_EXIGIDOS = Symbol('PAPEIS_EXIGIDOS');

interface RequisicaoAutenticada {
  headers: Record<string, string | string[] | undefined>;
  usuario?: DadosToken;
}

/** Exige o token de acesso no header Authorization e, se houver, um dos papéis da rota. */
@Injectable()
export class GuardAutenticacao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [esquema, token] = String(requisicao.headers.authorization ?? '').split(' ');
    const dados = esquema === 'Bearer' && token ? await this.tokens.verificar(token) : null;
    if (!dados) throw erroNaoAutenticado();

    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(PAPEIS_EXIGIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (papeis?.length && !papeis.includes(dados.papel)) throw erroAcessoNegado();

    requisicao.usuario = dados;
    return true;
  }
}

/**
 * Rota só para quem está logado. Com papéis, só para eles; os outros recebem 403. A checagem de
 * escopo (órgão e município do token contra o recurso) fica no caso de uso.
 */
export function Autenticado(...papeis: Papel[]): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(PAPEIS_EXIGIDOS, papeis),
    UseGuards(GuardAutenticacao),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Sem token, ou token inválido ou expirado.' }),
    ...(papeis.length
      ? [ApiForbiddenResponse({ description: `Só para: ${papeis.join(', ')}.` })]
      : []),
  );
}

/** Os dados do token de quem fez a requisição (use junto com @Autenticado). */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): DadosToken => {
    const usuario = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().usuario;
    if (!usuario) throw erroNaoAutenticado();
    return usuario;
  },
);
