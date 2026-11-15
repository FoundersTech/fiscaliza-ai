import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import {
  aproveitavel,
  chaveDoArquivo,
  type Exportacao,
  expiracaoDe,
  StatusExportacao,
  statusVigente,
  VALIDADE_LINK_S,
} from '../domain/exportacao.js';
import {
  ARQUIVOS_EXPORTACAO,
  type ArquivosExportacao,
  COLETOR_DADOS,
  type ColetorDados,
  REPOSITORIO_EXPORTACOES,
  type RepositorioExportacoes,
} from './portas.js';

/** Fila e job `privacidade.exportar`. */
export const FILA_PRIVACIDADE = 'privacidade';
export const JOB_EXPORTAR = 'exportar';
export const TENTATIVAS_EXPORTACAO = 3;

export interface JobExportar {
  exportacaoId: string;
}

const SETE_DIAS_S = 7 * 24 * 60 * 60;
const HISTORICO = 10;

export function jobIdDaExportacao(exportacaoId: string): string {
  return `exportacao-${exportacaoId}`;
}

export function exportacaoNaoEncontrada(): ErroAplicacao {
  return new ErroAplicacao('EXPORTACAO_NAO_ENCONTRADA', 'Exportação não encontrada.', 404);
}

@Injectable()
export class FilaExportacoes {
  constructor(@InjectQueue(FILA_PRIVACIDADE) private readonly fila: Queue<JobExportar>) {}

  /** Um job com o mesmo id que ainda está na fila não é duplicado. */
  async gerar(exportacaoId: string): Promise<void> {
    await this.fila.add(
      JOB_EXPORTAR,
      { exportacaoId },
      {
        jobId: jobIdDaExportacao(exportacaoId),
        attempts: TENTATIVAS_EXPORTACAO,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: { age: SETE_DIAS_S },
      },
    );
  }
}

@Injectable()
export class SolicitarExportacao {
  private readonly logger = new Logger(SolicitarExportacao.name);

  constructor(
    @Inject(REPOSITORIO_EXPORTACOES) private readonly exportacoes: RepositorioExportacoes,
    private readonly fila: FilaExportacoes,
  ) {}

  /**
   * Cria a exportação e agenda a geração do arquivo. Se já há uma em andamento ou pronta para
   * baixar, devolve essa mesma.
   */
  async executar(usuarioId: string, agora = new Date()): Promise<Exportacao> {
    const { exportacao } = await this.exportacoes.aproveitarOuCriar(usuarioId, agora, (atual) =>
      aproveitavel(atual, agora),
    );
    if (exportacao.status === StatusExportacao.PROCESSANDO) {
      // Também para a que já existia: se o Redis estava fora no primeiro pedido, o job nasce aqui.
      try {
        await this.fila.gerar(exportacao.id);
      } catch (erro) {
        this.logger.warn(`Exportação ${exportacao.id} sem geração agendada: ${String(erro)}`);
      }
    }
    return exportacao;
  }
}

/** Como o cidadão vê uma exportação. */
export interface SituacaoExportacao {
  id: string;
  status: StatusExportacao;
  solicitadaEm: Date;
  prontaEm: Date | null;
  expiraEm: Date | null;
  /** Só quando pronta. Vale por 15 minutos. */
  downloadUrl: string | null;
}

@Injectable()
export class ConsultarExportacoes {
  constructor(
    @Inject(REPOSITORIO_EXPORTACOES) private readonly exportacoes: RepositorioExportacoes,
    @Inject(ARQUIVOS_EXPORTACAO) private readonly arquivos: ArquivosExportacao,
  ) {}

  /** A exportação de outro usuário responde 404, como se não existisse. */
  async obter(usuarioId: string, id: string, agora = new Date()): Promise<SituacaoExportacao> {
    const exportacao = await this.exportacoes.buscar(id);
    if (!exportacao || exportacao.usuarioId !== usuarioId) throw exportacaoNaoEncontrada();
    return this.situacao(exportacao, agora);
  }

  /** As últimas exportações do usuário, das mais recentes para as mais antigas. */
  async listar(usuarioId: string, agora = new Date()): Promise<SituacaoExportacao[]> {
    const exportacoes = await this.exportacoes.doUsuario(usuarioId, HISTORICO);
    return Promise.all(exportacoes.map((exportacao) => this.situacao(exportacao, agora)));
  }

  private async situacao(exportacao: Exportacao, agora: Date): Promise<SituacaoExportacao> {
    const status = statusVigente(exportacao, agora);
    const pronta = status === StatusExportacao.PRONTA && exportacao.storageKey !== null;
    return {
      id: exportacao.id,
      status,
      solicitadaEm: exportacao.solicitadaEm,
      prontaEm: exportacao.prontaEm,
      expiraEm: exportacao.expiraEm,
      downloadUrl: pronta
        ? await this.arquivos.urlDeDownload(
            exportacao.storageKey as string,
            nomeDoArquivo(exportacao.solicitadaEm),
            VALIDADE_LINK_S,
          )
        : null,
    };
  }
}

function nomeDoArquivo(solicitadaEm: Date): string {
  return `fiscaliza-ai-meus-dados-${solicitadaEm.toISOString().slice(0, 10)}.json`;
}

@Injectable()
export class GerarExportacao {
  constructor(
    @Inject(REPOSITORIO_EXPORTACOES) private readonly exportacoes: RepositorioExportacoes,
    @Inject(ARQUIVOS_EXPORTACAO) private readonly arquivos: ArquivosExportacao,
    @Inject(COLETOR_DADOS) private readonly coletor: ColetorDados,
  ) {}

  /**
   * Monta o JSON com os dados do usuário, grava no bucket privado e marca a exportação como
   * pronta por 7 dias. Exportação que sumiu (conta excluída) ou já decidida é ignorada.
   */
  async executar(exportacaoId: string, agora = new Date()): Promise<void> {
    const exportacao = await this.exportacoes.buscar(exportacaoId);
    if (!exportacao || exportacao.status !== StatusExportacao.PROCESSANDO) return;

    const dados = await this.coletor.coletar(exportacao.usuarioId);
    if (!dados) {
      await this.exportacoes.marcarFalha(exportacao.id);
      return;
    }

    const chave = chaveDoArquivo(exportacao.usuarioId, exportacao.id);
    const json = JSON.stringify({ gerado_em: agora.toISOString(), ...dados }, null, 2);
    await this.arquivos.gravar(chave, json);
    const marcada = await this.exportacoes.marcarPronta(
      exportacao.id,
      chave,
      agora,
      expiracaoDe(agora),
    );
    // A conta foi excluída enquanto o arquivo era gravado: ele não pode ficar no bucket.
    if (!marcada) await this.arquivos.apagar(chave);
  }

  /** Chamado quando as tentativas acabam. */
  async falhou(exportacaoId: string): Promise<void> {
    await this.exportacoes.marcarFalha(exportacaoId);
  }
}
