import { createHash } from 'node:crypto';

import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { Redis } from 'ioredis';
import { ErroAplicacao } from '../erros/erro-aplicacao.js';
import { REDIS } from '../redis/redis.module.js';

export interface RequisicaoLimitada {
  ip: string;
  body?: unknown;
}

export interface RegraLimiteTaxa {
  nome: string;
  maximo: number;
  janelaSegundos: number;
  chave: (requisicao: RequisicaoLimitada) => string;
}

const REGRA = Symbol('REGRA_LIMITE_TAXA');

/**
 * Limita quantas vezes a mesma chave chama a rota numa janela fixa. Passou do máximo: 429 com
 * Retry-After. Se o Redis cair, a rota segue liberada (com aviso no log) em vez de sair do ar.
 */
@Injectable()
export class GuardLimiteTaxa implements CanActivate {
  private readonly logger = new Logger(GuardLimiteTaxa.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const regra = this.reflector.get<RegraLimiteTaxa | undefined>(REGRA, contexto.getHandler());
    if (!regra) return true;

    const http = contexto.switchToHttp();
    // A chave vai como hash: o Redis não guarda IP nem e-mail em claro.
    const chave = `limite:${regra.nome}:${resumo(regra.chave(http.getRequest<RequisicaoLimitada>()))}`;

    let total: number;
    let segundosRestantes: number;
    try {
      const resultado = await this.redis
        .multi()
        .set(chave, 0, 'EX', regra.janelaSegundos, 'NX')
        .incr(chave)
        .ttl(chave)
        .exec();
      total = Number(resultado?.[1]?.[1]);
      segundosRestantes = Number(resultado?.[2]?.[1]);
    } catch (erro) {
      this.logger.warn(`Limite de ${regra.nome} sem Redis, requisição liberada: ${String(erro)}`);
      return true;
    }

    if (total > regra.maximo) {
      const espera = segundosRestantes > 0 ? segundosRestantes : regra.janelaSegundos;
      http
        .getResponse<{ header(nome: string, valor: string): unknown }>()
        .header('Retry-After', String(espera));
      throw new ErroAplicacao(
        'MUITAS_REQUISICOES',
        `Muitas tentativas. Tente de novo em ${espera} segundos.`,
        429,
        { tentar_em_segundos: espera },
      );
    }
    return true;
  }
}

export function LimiteTaxa(regra: RegraLimiteTaxa): MethodDecorator & ClassDecorator {
  return applyDecorators(
    SetMetadata(REGRA, regra),
    UseGuards(GuardLimiteTaxa),
    ApiTooManyRequestsResponse({
      description: `Mais de ${regra.maximo} tentativas em ${regra.janelaSegundos} s.`,
    }),
  );
}

function resumo(texto: string): string {
  return createHash('sha256').update(texto).digest('base64url');
}
