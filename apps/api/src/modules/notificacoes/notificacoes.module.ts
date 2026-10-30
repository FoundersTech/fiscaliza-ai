import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE } from '../../shared/config/ambiente.js';
import { EMAIL_PORT } from './application/email.port.js';
import {
  FILA_EMAIL,
  OPCOES_FILA_EMAIL,
  OPCOES_FILA_EMAIL_PADRAO,
  ServicoEmail,
} from './application/servico-email.js';
import { criarEmailPort } from './infrastructure/criar-email-port.js';
import { EmailProcessor } from './infrastructure/email.processor.js';

/** Notificações. Por enquanto só o e-mail transacional. */
@Module({
  imports: [BullModule.registerQueue({ name: FILA_EMAIL })],
  providers: [
    ServicoEmail,
    EmailProcessor,
    { provide: OPCOES_FILA_EMAIL, useValue: OPCOES_FILA_EMAIL_PADRAO },
    { provide: EMAIL_PORT, inject: [AMBIENTE], useFactory: criarEmailPort },
  ],
  exports: [ServicoEmail],
})
export class NotificacoesModule {}
