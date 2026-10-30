import { Inject, Injectable } from '@nestjs/common';

import { AMBIENTE, type Ambiente } from '../../../shared/config/ambiente.js';
import { PARAMETROS, type Parametros } from '../../../shared/config/parametros.js';
import { ErroAplicacao } from '../../../shared/erros/erro-aplicacao.js';
import {
  type CategoriaAtiva,
  type MunicipioAtendido,
  REPOSITORIO_TERRITORIO,
  type RepositorioTerritorio,
} from './portas.js';

export interface ConfigPublica {
  municipio: MunicipioAtendido;
  categoriasAtivas: CategoriaAtiva[];
  urgenteMinConfirmacoes: number;
  politicaVersao: string;
  googleMapsMapId: string;
}

/** O que o PWA precisa saber ao abrir: a cidade, as categorias e os parâmetros públicos. */
@Injectable()
export class ObterConfigPublica {
  constructor(
    @Inject(REPOSITORIO_TERRITORIO) private readonly territorios: RepositorioTerritorio,
    @Inject(PARAMETROS) private readonly parametros: Parametros,
    @Inject(AMBIENTE) private readonly ambiente: Ambiente,
  ) {}

  async executar(): Promise<ConfigPublica> {
    const [municipio, categoriasAtivas] = await Promise.all([
      this.territorios.municipioAtendido(),
      this.territorios.categoriasAtivas(),
    ]);
    if (!municipio) {
      throw new ErroAplicacao(
        'MUNICIPIO_NAO_CONFIGURADO',
        'O Fiscaliza Aí! ainda não atende nenhuma cidade.',
        503,
      );
    }

    return {
      municipio,
      categoriasAtivas,
      urgenteMinConfirmacoes: this.parametros.urgente_min_confirmacoes,
      politicaVersao: this.ambiente.POLITICA_VERSAO,
      googleMapsMapId: this.ambiente.GOOGLE_MAPS_MAP_ID,
    };
  }
}
