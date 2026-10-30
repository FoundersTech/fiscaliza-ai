import { Inject, Injectable, Logger } from '@nestjs/common';

import { formatarEndereco, type Ponto } from '../domain/endereco.js';
import {
  GEOCODING_PORT,
  type GeocodingPort,
  REPOSITORIO_TERRITORIO,
  type RepositorioTerritorio,
  type Territorio,
} from './portas.js';

export const LIMITE_GEOCODING_MS = 2000;

@Injectable()
export class ResolverTerritorio {
  constructor(
    @Inject(REPOSITORIO_TERRITORIO) private readonly territorios: RepositorioTerritorio,
  ) {}

  executar(ponto: Ponto): Promise<Territorio | null> {
    return this.territorios.localizar(ponto);
  }
}

@Injectable()
export class EnderecoReverso {
  private readonly logger = new Logger(EnderecoReverso.name);

  constructor(@Inject(GEOCODING_PORT) private readonly geocoding: GeocodingPort) {}

  async executar(ponto: Ponto): Promise<string | null> {
    const cancelamento = new AbortController();
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<'demorou'>((resolver) => {
      temporizador = setTimeout(() => resolver('demorou'), LIMITE_GEOCODING_MS);
    });

    try {
      const resultado = await Promise.race([
        this.geocoding.enderecoDe(ponto, cancelamento.signal),
        limite,
      ]);
      if (resultado === 'demorou') {
        cancelamento.abort();
        this.logger.warn(`Endereço sem resposta em ${LIMITE_GEOCODING_MS} ms`);
        return null;
      }
      return resultado ? formatarEndereco(resultado) : null;
    } catch (erro) {
      this.logger.warn(`Endereço indisponível: ${String(erro)}`);
      return null;
    } finally {
      clearTimeout(temporizador);
    }
  }
}

export interface ConsultaPonto {
  endereco: string | null;
  dentroDaArea: boolean;
}

/** O que o passo 3 mostra quando o pino para num ponto. */
@Injectable()
export class ConsultarPonto {
  constructor(
    private readonly resolverTerritorio: ResolverTerritorio,
    private readonly enderecoReverso: EnderecoReverso,
  ) {}

  /** Fora da área o envio é bloqueado, então o endereço nem é buscado. */
  async executar(ponto: Ponto): Promise<ConsultaPonto> {
    const territorio = await this.resolverTerritorio.executar(ponto);
    if (!territorio) return { endereco: null, dentroDaArea: false };
    return { endereco: await this.enderecoReverso.executar(ponto), dentroDaArea: true };
  }
}
