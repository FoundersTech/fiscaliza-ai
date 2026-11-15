import { Inject, Injectable, Logger } from '@nestjs/common';

import { backupsVencidos, chaveBackup, PREFIXO_BACKUP } from '../domain/backup.js';
import { ARMAZEM_BACKUP, type ArmazemBackup, GERADOR_DUMP, type GeradorDump } from './portas.js';

/** Job `backup`, todo dia às 04:00 de São Paulo. */
export const JOB_BACKUP = 'backup';
export const AGENDA_BACKUP = '0 4 * * *';

export interface BackupFeito {
  chave: string;
  bytes: number;
  apagados: string[];
}

@Injectable()
export class FazerBackup {
  private readonly logger = new Logger(FazerBackup.name);

  constructor(
    @Inject(GERADOR_DUMP) private readonly gerador: GeradorDump,
    @Inject(ARMAZEM_BACKUP) private readonly armazem: ArmazemBackup,
  ) {}

  /**
   * Copia o banco para o bucket de backup e apaga os que passaram de 7 dias. Os antigos só saem
   * depois que o de hoje foi gravado.
   */
  async executar(agora = new Date()): Promise<BackupFeito> {
    const chave = chaveBackup(agora);
    const dump = await this.gerador.gerar();
    try {
      await this.armazem.enviar(chave, dump.caminho, dump.bytes);
    } finally {
      await dump.descartar();
    }

    const vencidos = backupsVencidos(await this.armazem.listar(PREFIXO_BACKUP), agora);
    for (const vencido of vencidos) await this.armazem.apagar(vencido);

    this.logger.log(
      `Backup do banco gravado em ${chave} (${dump.bytes} bytes); ${vencidos.length} antigos apagados`,
    );
    return { chave, bytes: dump.bytes, apagados: vencidos };
  }
}
