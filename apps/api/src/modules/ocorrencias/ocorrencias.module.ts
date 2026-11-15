import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MidiaModule } from '../midia/midia.module.js';
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js';
import { TerritorioModule } from '../territorio/territorio.module.js';
import { ListarFilaOrgao, ObterDetalheAtendimento } from './application/atendimento.js';
import { MontadorCard } from './application/card.js';
import { ConfirmarOcorrencia } from './application/confirmar-ocorrencia.js';
import { CONSULTAS_OCORRENCIAS } from './application/consultas.js';
import {
  FILA_TERRITORIO,
  FilaEnderecos,
  PreencherEndereco,
  ReconciliarEnderecos,
} from './application/enderecos.js';
import { ListarFeed } from './application/listar-feed.js';
import { ListarMapa } from './application/listar-mapa.js';
import { ListarMinhas } from './application/listar-minhas.js';
import { ObterDetalhe } from './application/obter-detalhe.js';
import { REPOSITORIO_OCORRENCIAS } from './application/portas.js';
import { AvaliarAtendimento, ReabrirOcorrencia } from './application/pos-resolucao.js';
import { RegistrarOcorrencia } from './application/registrar-ocorrencia.js';
import { TransicionarStatus } from './application/transicionar-status.js';
import { ConsultasOcorrenciasPrisma } from './infrastructure/consultas-ocorrencias.prisma.js';
import { EnderecoProcessor } from './infrastructure/endereco.processor.js';
import { RepositorioOcorrenciasPrisma } from './infrastructure/repositorio-ocorrencias.prisma.js';
import { AtendimentoController } from './presentation/atendimento.controller.js';
import {
  ConsultasController,
  MinhasOcorrenciasController,
} from './presentation/consultas.controller.js';
import { OcorrenciasController } from './presentation/ocorrencias.controller.js';

/**
 * Registro, confirmação, feed, mapa e detalhe de ocorrências, a lista do autor, o atendimento
 * pelo órgão, a avaliação e a reabertura depois da resolução, e o endereço das que nasceram sem ele.
 */
@Module({
  imports: [
    TerritorioModule,
    MidiaModule,
    NotificacoesModule,
    BullModule.registerQueue({ name: FILA_TERRITORIO }),
  ],
  controllers: [
    OcorrenciasController,
    ConsultasController,
    MinhasOcorrenciasController,
    AtendimentoController,
  ],
  providers: [
    RegistrarOcorrencia,
    ConfirmarOcorrencia,
    MontadorCard,
    ListarFeed,
    ListarMapa,
    ObterDetalhe,
    ListarMinhas,
    ListarFilaOrgao,
    ObterDetalheAtendimento,
    TransicionarStatus,
    AvaliarAtendimento,
    ReabrirOcorrencia,
    FilaEnderecos,
    PreencherEndereco,
    ReconciliarEnderecos,
    EnderecoProcessor,
    { provide: REPOSITORIO_OCORRENCIAS, useClass: RepositorioOcorrenciasPrisma },
    { provide: CONSULTAS_OCORRENCIAS, useClass: ConsultasOcorrenciasPrisma },
  ],
  exports: [ReconciliarEnderecos, MontadorCard],
})
export class OcorrenciasModule {}
