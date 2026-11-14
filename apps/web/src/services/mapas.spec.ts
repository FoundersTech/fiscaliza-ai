import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importLibrary = vi.fn();
vi.mock('@googlemaps/js-api-loader', () => ({
  setOptions: vi.fn(),
  importLibrary: (nome: string) => importLibrary(nome) as unknown,
}));

/** Cada teste começa com o módulo zerado (carregado uma vez por página no app). */
async function servico() {
  vi.resetModules();
  return import('./mapas');
}

function bibliotecasOk() {
  importLibrary.mockImplementation((nome: string) =>
    Promise.resolve(
      {
        maps: { Map: class {} },
        marker: { AdvancedMarkerElement: class {}, PinElement: class {} },
        places: { PlaceAutocompleteElement: class {} },
      }[nome],
    ),
  );
}

describe('carregarMaps', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    importLibrary.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sem chave no build, o mapa fica indisponível sem chamar o Google', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    const { carregarMaps, MapaIndisponivel } = await servico();

    await expect(carregarMaps()).rejects.toBeInstanceOf(MapaIndisponivel);
    expect(importLibrary).not.toHaveBeenCalled();
  });

  it('com a chave, carrega o mapa, o marcador e o alfinete', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'chave-de-teste');
    bibliotecasOk();
    const { carregarMaps } = await servico();

    const bibliotecas = await carregarMaps();

    expect(Object.keys(bibliotecas).sort()).toEqual(['AdvancedMarkerElement', 'Map', 'PinElement']);
  });

  it('com falha de rede ao baixar o Maps, o mapa fica indisponível', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'chave-de-teste');
    importLibrary.mockRejectedValue(new Error('The Google Maps JavaScript API could not load.'));
    const { carregarMaps, MapaIndisponivel } = await servico();

    await expect(carregarMaps()).rejects.toBeInstanceOf(MapaIndisponivel);
  });

  it('com a chave recusada pelo Google, avisa a tela e não tenta carregar de novo', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'chave-invalida');
    bibliotecasOk();
    const { carregarMaps, quandoRecusarChave, MapaIndisponivel } = await servico();
    const avisar = vi.fn();
    quandoRecusarChave(avisar);
    await carregarMaps();

    // O Google chama esta função global quando a chave não vale para o site.
    (window as { gm_authFailure?: () => void }).gm_authFailure!();

    expect(avisar).toHaveBeenCalledOnce();
    await expect(carregarMaps()).rejects.toBeInstanceOf(MapaIndisponivel);
  });

  it('quem cancelou o aviso não é mais chamado', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'chave-invalida');
    bibliotecasOk();
    const { carregarMaps, quandoRecusarChave } = await servico();
    const avisar = vi.fn();
    const cancelar = quandoRecusarChave(avisar);
    await carregarMaps();

    cancelar();
    (window as { gm_authFailure?: () => void }).gm_authFailure!();

    expect(avisar).not.toHaveBeenCalled();
  });
});

describe('carregarBuscaDeLugares', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'chave-de-teste');
    importLibrary.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('carrega o campo de busca depois do mapa', async () => {
    bibliotecasOk();
    const { carregarMaps, carregarBuscaDeLugares } = await servico();
    await carregarMaps();

    const { PlaceAutocompleteElement } = await carregarBuscaDeLugares();

    expect(PlaceAutocompleteElement).toBeTypeOf('function');
  });

  it('sem o Places liberado para a chave, a busca fica indisponível e o mapa segue', async () => {
    importLibrary.mockImplementation((nome: string) =>
      nome === 'places'
        ? Promise.reject(new Error('ApiNotActivatedMapError'))
        : Promise.resolve({ Map: class {}, AdvancedMarkerElement: class {}, PinElement: class {} }),
    );
    const { carregarMaps, carregarBuscaDeLugares, MapaIndisponivel } = await servico();

    await expect(carregarMaps()).resolves.toBeDefined();
    await expect(carregarBuscaDeLugares()).rejects.toBeInstanceOf(MapaIndisponivel);
  });
});
