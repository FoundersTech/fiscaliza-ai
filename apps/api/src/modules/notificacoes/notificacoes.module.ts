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
import { AlertasController } from './presentation/alertas.controller.js';

/** Notificações: e-mail transacional, a aba Alertas e a fila de avisos das mudanças de status. */
@Module({
  imports: [
    BullModule.registerQueue({ name: FILA_EMAIL }),
    BullModule.registerQueue({ name: FILA_NOTIFICACOES }),
  ],
  controllers: [AlertasController],
  providers: [
    ServicoEmail,
    EmailProcessor,
    FilaNotificacoes,
    EventoProcessor,
    ListarAlertas,
    ContarAlertasNovos,
    MarcarAlertasVistos,
    DestinatariosDoEvento,
    { provide: CONSULTAS_ALERTAS, useClass: ConsultasAlertasPrisma },
    { provide: OPCOES_FILA_EMAIL, useValue: OPCOES_FILA_EMAIL_PADRAO },
    { provide: EMAIL_PORT, inject: [AMBIENTE], useFactory: criarEmailPort },
  ],
  exports: [ServicoEmail, FilaNotificacoes, DestinatariosDoEvento],
})
export class NotificacoesModule {}
