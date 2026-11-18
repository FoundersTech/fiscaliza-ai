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
import { AMBIENTE, type Ambiente } from '../config/ambiente.js';
import { ErroAplicacao } from '../erros/erro-aplicacao.js';
import { REDIS } from '../redis/redis.module.js';

export interface RequisicaoLimitada {
  ip: string;
  body?: unknown;
  /** Preenchido pelo guard de autenticação, quando a rota exige login. */
  usuario?: { usuarioId: string };
}

export interface RegraLimiteTaxa {
  nome: string;
  maximo: number;
  janelaSegundos: number;
  chave: (requisicao: RequisicaoLimitada) => string;
}

const REGRA = Symbol('REGRA_LIMITE_TAXA');

/**
 * GETs abertos a visitantes: 600 por minuto por IP, somando todas as rotas públicas. Numa rede
 * compartilhada (Wi-Fi de faculdade, 4G com CGNAT), todo mundo sai pelo mesmo IP, e cada abertura
 * do app já faz algumas leituras. O limite comporta umas dezenas de pessoas usando o app juntas e
 * ainda segura um robô em 10 leituras por segundo.
 */
export const LEITURA_PUBLICA: RegraLimiteTaxa = {
  nome: 'leitura-publica',
  maximo: 600,
  janelaSegundos: 60,
  chave: ({ ip }) => ip,
};

/**
 * Regra contada por conta, não por IP. O decorator @LimiteTaxa com ela fica ACIMA do
 * @Autenticado: o guard de baixo roda primeiro, e o usuário só existe depois dele.
 */
export function porUsuario(nome: string, maximo: number, janelaSegundos: number): RegraLimiteTaxa {
  return {
    nome,
    maximo,
    janelaSegundos,
    chave: ({ usuario }) => {
      if (!usuario) throw new Error(`Limite ${nome} por usuário checado antes da autenticação`);
      return usuario.usuarioId;
    },
  };
}

/**
 * Limita quantas vezes a mesma chave chama a rota numa janela fixa. Passou do máximo: 429 com
 * Retry-After. Se o Redis cair, a rota segue liberada (com aviso no log) em vez de sair do ar.
 * Com LIMITE_TAXA_DESLIGADO=true (só no teste de carga), nada é contado.
 */
@Injectable()
export class GuardLimiteTaxa implements CanActivate {
  private readonly logger = new Logger(GuardLimiteTaxa.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(AMBIENTE) private readonly ambiente: Pick<Ambiente, 'LIMITE_TAXA_DESLIGADO'>,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    if (this.ambiente.LIMITE_TAXA_DESLIGADO) return true;
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
