import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AMBIENTE } from '../../shared/config/ambiente.js';
import {
  CONSULTAS_ALERTAS,
  ContarAlertasNovos,
  DestinatariosDoEvento,
  ListarAlertas,
  MarcarAlertasVistos,
} from './application/alertas.js';
import { EMAIL_PORT } from './application/email.port.js';
import { FILA_NOTIFICACOES, FilaNotificacoes } from './application/fila-notificacoes.js';
import { REPOSITORIO_PUSH } from './application/portas.js';
import { CancelarPush, EnviarPushEvento, InscreverPush } from './application/push.js';
import { PUSH_PORT } from './application/push.port.js';
import {
  FILA_EMAIL,
  OPCOES_FILA_EMAIL,
  OPCOES_FILA_EMAIL_PADRAO,
  ServicoEmail,
} from './application/servico-email.js';
import { ConsultasAlertasPrisma } from './infrastructure/consultas-alertas.prisma.js';
import { criarEmailPort } from './infrastructure/criar-email-port.js';
import { EmailProcessor } from './infrastructure/email.processor.js';
import { EventoProcessor } from './infrastructure/evento.processor.js';
import { RepositorioPushPrisma } from './infrastructure/repositorio-push.prisma.js';
import { criarPushPort } from './infrastructure/web-push.adapter.js';
import { AlertasController } from './presentation/alertas.controller.js';
import { PushController } from './presentation/push.controller.js';

/**
 * Notificações: e-mail transacional, a aba Alertas e o Web Push das mudanças de status, enviado
 * pela fila `notificacoes`.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: FILA_EMAIL }),
    BullModule.registerQueue({ name: FILA_NOTIFICACOES }),
  ],
  controllers: [AlertasController, PushController],
  providers: [
    ServicoEmail,
    EmailProcessor,
    FilaNotificacoes,
    EventoProcessor,
    ListarAlertas,
    ContarAlertasNovos,
    MarcarAlertasVistos,
    DestinatariosDoEvento,
    InscreverPush,
    CancelarPush,
    EnviarPushEvento,
    { provide: CONSULTAS_ALERTAS, useClass: ConsultasAlertasPrisma },
    { provide: REPOSITORIO_PUSH, useClass: RepositorioPushPrisma },
    { provide: PUSH_PORT, inject: [AMBIENTE], useFactory: criarPushPort },
    { provide: OPCOES_FILA_EMAIL, useValue: OPCOES_FILA_EMAIL_PADRAO },
    { provide: EMAIL_PORT, inject: [AMBIENTE], useFactory: criarEmailPort },
  ],
  exports: [ServicoEmail, FilaNotificacoes, DestinatariosDoEvento],
})
export class NotificacoesModule {}
