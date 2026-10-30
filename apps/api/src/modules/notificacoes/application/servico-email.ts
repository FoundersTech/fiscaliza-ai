import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import type { MensagemEmail } from './email.port.js';
import {
  type ConteudoEmail,
  emailConvite,
  emailRedefinicaoSenha,
  type PapelConvidado,
} from './templates-email.js';

/** Fila e job `email.enviar`. */
export const FILA_EMAIL = 'email';
export const JOB_ENVIAR = 'enviar';

export const OPCOES_FILA_EMAIL = Symbol('OPCOES_FILA_EMAIL');

export interface OpcoesFilaEmail {
  tentativas: number;
  /** Espera antes da 2ª tentativa; dobra a cada falha (30 s, 1 min, 2 min, 4 min). */
  atrasoInicialMs: number;
}

export const OPCOES_FILA_EMAIL_PADRAO: OpcoesFilaEmail = { tentativas: 5, atrasoInicialMs: 30_000 };

const SETE_DIAS_S = 7 * 24 * 60 * 60;

/**
 * Monta os e-mails transacionais e os enfileira; o envio fica com o worker (EmailProcessor).
 * Os outros módulos recebem o token em claro e chamam este serviço depois de gravar o hash.
 */
@Injectable()
export class ServicoEmail {
  constructor(
    @InjectQueue(FILA_EMAIL) private readonly fila: Queue<MensagemEmail>,
    @Inject(OPCOES_FILA_EMAIL) private readonly opcoes: OpcoesFilaEmail,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  enviarRedefinicaoSenha(dados: { para: string; nome: string; token: string }): Promise<void> {
    const link = this.linkDefinirSenha(dados.token);
    return this.enfileirar(dados.para, emailRedefinicaoSenha({ nome: dados.nome, link }));
  }

  enviarConvite(dados: {
    para: string;
    nome: string;
    token: string;
    papel: PapelConvidado;
    orgao?: string;
  }): Promise<void> {
    const { para, token, ...conteudo } = dados;
    const link = this.linkDefinirSenha(token);
    return this.enfileirar(para, emailConvite({ ...conteudo, link }));
  }

  /** A mesma tela serve para redefinição e convite. */
  private linkDefinirSenha(token: string): string {
    return `${this.ambiente.WEB_URL}/definir-senha?token=${encodeURIComponent(token)}`;
  }

  private async enfileirar(para: string, conteudo: ConteudoEmail): Promise<void> {
    await this.fila.add(
      JOB_ENVIAR,
      { para, ...conteudo },
      {
        attempts: this.opcoes.tentativas,
        backoff: { type: 'exponential', delay: this.opcoes.atrasoInicialMs },
        // O job leva o link com o token: some do Redis assim que é enviado.
        removeOnComplete: true,
        removeOnFail: { age: SETE_DIAS_S },
      },
    );
  }
}
