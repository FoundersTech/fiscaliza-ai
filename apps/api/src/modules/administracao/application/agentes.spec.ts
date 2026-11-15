import { describe, expect, it, vi } from 'vitest';

import type { AlterarAtivacaoConta } from '../../identidade/application/contas.js';
import type { DadosToken } from '../../identidade/application/portas.js';
import { Papel } from '../../identidade/domain/papel.js';
import { AlterarAgente } from './agentes.js';
import type { Agente, RepositorioAdministracao } from './portas.js';

const AGORA = new Date('2026-11-14T12:00:00.000Z');
const GESTOR: DadosToken = {
  usuarioId: 'gestor-1',
  papel: Papel.ADMIN_MUNICIPIO,
  municipioId: 3552205,
  orgaoId: null,
};

function montar(agente: Partial<Agente> | null = {}) {
  const repositorio = {
    buscarOrgaoDoMunicipio: vi
      .fn<RepositorioAdministracao['buscarOrgaoDoMunicipio']>()
      .mockResolvedValue({ id: 1, municipioId: 3552205, nome: 'Prefeitura', sigla: 'PMS' }),
    buscarAgente: vi.fn<RepositorioAdministracao['buscarAgente']>().mockResolvedValue(
      agente && {
        id: 'agente-1',
        nome: 'João',
        email: 'joao@exemplo.test',
        orgaoId: 1,
        ativo: true,
        convitePendente: false,
        ...agente,
      },
    ),
  };
  const ativacao = { executar: vi.fn<AlterarAtivacaoConta['executar']>() };
  const alterar = new AlterarAgente(
    repositorio as unknown as RepositorioAdministracao,
    ativacao as unknown as AlterarAtivacaoConta,
  );
  return { alterar, ativacao };
}

describe('AlterarAgente', () => {
  it('desativa o agente do órgão do gestor', async () => {
    const { alterar, ativacao } = montar();

    await expect(
      alterar.executar(GESTOR, 'agente-1', { ativo: false }, AGORA),
    ).resolves.toMatchObject({ id: 'agente-1', ativo: false });
    expect(ativacao.executar).toHaveBeenCalledWith('agente-1', false, AGORA);
  });

  it('agente de outro órgão é 403 OUTRO_MUNICIPIO, sem mexer na conta', async () => {
    const { alterar, ativacao } = montar({ orgaoId: 2 });

    await expect(
      alterar.executar(GESTOR, 'agente-1', { ativo: false }, AGORA),
    ).rejects.toMatchObject({ codigo: 'OUTRO_MUNICIPIO', status: 403 });
    expect(ativacao.executar).not.toHaveBeenCalled();
  });

  it('id que não é de agente é 404', async () => {
    const { alterar } = montar(null);

    await expect(alterar.executar(GESTOR, 'x', { ativo: true }, AGORA)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      status: 404,
    });
  });

  it('pedir o estado que o agente já tem não mexe na conta nem nas sessões', async () => {
    const { alterar, ativacao } = montar({ ativo: true });

    await alterar.executar(GESTOR, 'agente-1', { ativo: true }, AGORA);

    expect(ativacao.executar).not.toHaveBeenCalled();
  });
});
