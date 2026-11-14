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
import { ConferirAcesso } from '../application/politica.js';
import { type DadosToken, EMISSOR_TOKEN, type EmissorToken } from '../application/portas.js';
import type { Papel } from '../domain/papel.js';

const PAPEIS_EXIGIDOS = Symbol('PAPEIS_EXIGIDOS');
const POLITICA_DISPENSADA = Symbol('POLITICA_DISPENSADA');

interface RequisicaoAutenticada {
  headers: Record<string, string | string[] | undefined>;
  usuario?: DadosToken;
}

/**
 * Exige o token de acesso no header Authorization e, se houver, um dos papéis da rota. Confere
 * também no banco se a conta ainda pode entrar e se aceitou a versão vigente da política.
 */
@Injectable()
export class GuardAutenticacao implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    private readonly conferirAcesso: ConferirAcesso,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const [esquema, token] = String(requisicao.headers.authorization ?? '').split(' ');
    const dados = esquema === 'Bearer' && token ? await this.tokens.verificar(token) : null;
    if (!dados) throw erroNaoAutenticado();

    const alvos = [contexto.getHandler(), contexto.getClass()];
    const papeis = this.reflector.getAllAndOverride<Papel[] | undefined>(PAPEIS_EXIGIDOS, alvos);
    if (papeis?.length && !papeis.includes(dados.papel)) throw erroAcessoNegado();

    const dispensada = this.reflector.getAllAndOverride<boolean | undefined>(
      POLITICA_DISPENSADA,
      alvos,
    );
    await this.conferirAcesso.executar(dados.usuarioId, !dispensada);

    requisicao.usuario = dados;
    return true;
  }
}

/**
 * Rota aberta a visitantes que também atende quem está logado. Sem o header Authorization, segue
 * como visitante. Com ele, o token precisa ser válido (senão 401, para o PWA renovar a sessão) e
 * a conta precisa poder entrar. A política pendente não bloqueia: a rota é só de leitura.
 */
@Injectable()
export class GuardAutenticacaoOpcional implements CanActivate {
  constructor(
    @Inject(EMISSOR_TOKEN) private readonly tokens: EmissorToken,
    private readonly conferirAcesso: ConferirAcesso,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const cabecalho = requisicao.headers.authorization;
    if (cabecalho === undefined || cabecalho === '') return true;

    const [esquema, token] = String(cabecalho).split(' ');
    const dados = esquema === 'Bearer' && token ? await this.tokens.verificar(token) : null;
    if (!dados) throw erroNaoAutenticado();
    await this.conferirAcesso.executar(dados.usuarioId, false);

    requisicao.usuario = dados;
    return true;
  }
}

/** Rota pública com campos a mais para quem manda o token. Leia quem é com @UsuarioOpcional. */
export function AutenticacaoOpcional(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    UseGuards(GuardAutenticacaoOpcional),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Token enviado, mas inválido ou expirado.' }),
  );
}

/**
 * Rota só para quem está logado. Com papéis, só para eles; os outros recebem 403. Quem ainda não
 * aceitou a versão vigente da política também recebe 403. A checagem de escopo (órgão e
 * município do token contra o recurso) fica no caso de uso.
 */
export function Autenticado(...papeis: Papel[]): MethodDecorator & ClassDecorator {
  const pendente = 'POLITICA_PENDENTE: falta aceitar a versão vigente da política.';
  return applyDecorators(
    SetMetadata(PAPEIS_EXIGIDOS, papeis),
    ...exigirToken(),
    ApiForbiddenResponse({
      description: papeis.length
        ? `ACESSO_NEGADO: só para ${papeis.join(', ')}. ${pendente}`
        : pendente,
    }),
  );
}

/**
 * Como @Autenticado(), mas a rota funciona antes do aceite da política vigente. Só para o que o
 * PWA precisa para pedir o aceite: o perfil (que diz se falta o aceite) e o próprio aceite.
 */
export function AutenticadoSemPolitica(): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(POLITICA_DISPENSADA, true), ...exigirToken());
}

function exigirToken() {
  return [
    UseGuards(GuardAutenticacao),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: 'Sem token, ou token inválido ou expirado.' }),
  ];
}

/** Os dados do token de quem fez a requisição (use junto com @Autenticado). */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): DadosToken => {
    const usuario = contexto.switchToHttp().getRequest<RequisicaoAutenticada>().usuario;
    if (!usuario) throw erroNaoAutenticado();
    return usuario;
  },
);

/** Os dados do token, ou null para visitante (use junto com @AutenticacaoOpcional). */
export const UsuarioOpcional = createParamDecorator(
  (_dado: unknown, contexto: ExecutionContext): DadosToken | null =>
    contexto.switchToHttp().getRequest<RequisicaoAutenticada>().usuario ?? null,
);
