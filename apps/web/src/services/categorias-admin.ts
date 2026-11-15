import type { CategoriaAdmin, DadosCategoria } from './administracao';
import type { CampoAtributo } from './registro';

export type TipoCampo = CampoAtributo['tipo'];

/** Um campo extra no editor: guarda tudo, e o envio leva só o que o tipo usa. */
export interface CampoEditavel {
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio: boolean;
  min: number | null;
  max: number | null;
  opcoes: string[];
}

export interface FormularioCategoria {
  slug: string;
  nome: string;
  icone: string;
  slaDias: number | null;
  ativa: boolean;
  campos: CampoEditavel[];
}

export type ProblemasCampo = Partial<Record<'chave' | 'rotulo' | 'min' | 'max' | 'opcoes', string>>;

export const TIPOS_CAMPO: readonly { valor: TipoCampo; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'numero', rotulo: 'Número' },
  { valor: 'opcao', rotulo: 'Opções' },
];

export const SLUG_REGEX = /^[a-z0-9-]{2,40}$/;
export const ICONE_REGEX = /^[a-z0-9_]{2,60}$/;
export const CHAVE_REGEX = /^[a-z_]{2,30}$/;
export const NOME_MIN = 2;
export const NOME_MAX = 60;
export const SLA_MAX = 365;
/** Tamanho sugerido para um campo de texto novo. */
export const TEXTO_MAX_PADRAO = 100;

// ---------------------------------------------------------------------------------------------
// Conversões

export function campoNovo(): CampoEditavel {
  return {
    chave: '',
    rotulo: '',
    tipo: 'texto',
    obrigatorio: false,
    min: null,
    max: TEXTO_MAX_PADRAO,
    opcoes: [],
  };
}

export function paraEdicao(campo: CampoAtributo): CampoEditavel {
  return {
    chave: campo.chave,
    rotulo: campo.rotulo,
    tipo: campo.tipo,
    obrigatorio: campo.obrigatorio,
    min: campo.min ?? null,
    max: campo.max ?? null,
    opcoes: [...(campo.opcoes ?? [])],
  };
}

/** O formato que a API aceita: cada tipo só com as suas propriedades. */
export function paraEnvio(campo: CampoEditavel): CampoAtributo {
  const base = {
    chave: campo.chave.trim(),
    rotulo: campo.rotulo.trim(),
    tipo: campo.tipo,
    obrigatorio: campo.obrigatorio,
  };
  switch (campo.tipo) {
    case 'texto':
      return { ...base, max: campo.max ?? 0 };
    case 'numero':
      return { ...base, min: campo.min ?? 0, max: campo.max ?? 0 };
    case 'opcao':
      return { ...base, opcoes: campo.opcoes.map((opcao) => opcao.trim()) };
  }
}

export function formularioDe(categoria: CategoriaAdmin | null): FormularioCategoria {
  return categoria
    ? {
        slug: categoria.slug,
        nome: categoria.nome,
        icone: categoria.icone,
        slaDias: categoria.sla_dias,
        ativa: categoria.ativa,
        campos: categoria.schema_atributos.map(paraEdicao),
      }
    : { slug: '', nome: '', icone: '', slaDias: null, ativa: true, campos: [] };
}

export function dadosDoFormulario(formulario: FormularioCategoria): DadosCategoria {
  return {
    slug: formulario.slug.trim(),
    nome: formulario.nome.trim(),
    icone: formulario.icone.trim(),
    sla_dias: formulario.slaDias ?? 0,
    ativa: formulario.ativa,
    schema_atributos: formulario.campos.map(paraEnvio),
  };
}

/** Sem acentos, em minúsculas, com o separador no lugar do resto e sem sobras nas pontas. */
function normalizar(texto: string, permitido: RegExp, separador: string, max: number): string {
  const partes = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split('')
    .map((letra) => (permitido.test(letra) ? letra : ' '))
    .join('')
    .split(' ')
    .filter(Boolean);
  let resultado = '';
  for (const parte of partes) {
    const proximo = resultado ? `${resultado}${separador}${parte}` : parte;
    if (proximo.length > max) return resultado || parte.slice(0, max);
    resultado = proximo;
  }
  return resultado;
}

/** Sugestão de slug a partir do nome: "Água e esgoto" → "agua-e-esgoto". */
export function slugDoNome(nome: string): string {
  return normalizar(nome, /[a-z0-9]/, '-', 40);
}

/** Sugestão de chave a partir do rótulo: "Número do poste" → "numero_do_poste". */
export function chaveDoRotulo(rotulo: string): string {
  return normalizar(rotulo, /[a-z]/, '_', 30);
}

// ---------------------------------------------------------------------------------------------
// Validação (as mesmas regras da API)

export function problemaDoSlug(slug: string): string | null {
  return SLUG_REGEX.test(slug.trim()) ? null : 'Use de 2 a 40 letras minúsculas, números ou hífens';
}

export function problemaDoNome(nome: string): string | null {
  const tamanho = nome.trim().length;
  return tamanho >= NOME_MIN && tamanho <= NOME_MAX
    ? null
    : `O nome deve ter de ${NOME_MIN} a ${NOME_MAX} caracteres`;
}

export function problemaDoIcone(icone: string): string | null {
  return ICONE_REGEX.test(icone.trim()) ? null : 'Use o nome de um ícone do Material Icons';
}

export function problemaDoPrazo(dias: number | null): string | null {
  if (dias === null || !Number.isInteger(dias)) return 'Informe o prazo em dias';
  return dias >= 1 && dias <= SLA_MAX ? null : `O prazo deve ser de 1 a ${SLA_MAX} dias`;
}

function informado(valor: number | null): valor is number {
  return valor !== null && Number.isFinite(valor);
}

export function problemasDoCampo(
  campo: CampoEditavel,
  todos: readonly CampoEditavel[],
): ProblemasCampo {
  const problemas: ProblemasCampo = {};
  const chave = campo.chave.trim();
  if (!CHAVE_REGEX.test(chave)) {
    problemas.chave = 'Use de 2 a 30 letras minúsculas ou _';
  } else if (todos.filter((outro) => outro.chave.trim() === chave).length > 1) {
    problemas.chave = 'Outro campo já usa esta chave';
  }
  if (!campo.rotulo.trim()) problemas.rotulo = 'Informe o rótulo';

  switch (campo.tipo) {
    case 'texto':
      if (campo.max === null || !Number.isInteger(campo.max) || campo.max < 1) {
        problemas.max = 'Informe o tamanho máximo (a partir de 1)';
      }
      break;
    case 'numero':
      if (!informado(campo.min)) problemas.min = 'Informe o mínimo';
      if (!informado(campo.max)) problemas.max = 'Informe o máximo';
      else if (informado(campo.min) && campo.min > campo.max) {
        problemas.min = 'O mínimo não pode passar do máximo';
      }
      break;
    case 'opcao': {
      const opcoes = campo.opcoes.map((opcao) => opcao.trim());
      if (!opcoes.length) problemas.opcoes = 'Informe ao menos uma opção';
      else if (opcoes.some((opcao) => !opcao)) problemas.opcoes = 'Há uma opção vazia';
      else if (new Set(opcoes).size !== opcoes.length) problemas.opcoes = 'Há opções repetidas';
      break;
    }
  }
  return problemas;
}

export function formularioValido(formulario: FormularioCategoria): boolean {
  return (
    !problemaDoSlug(formulario.slug) &&
    !problemaDoNome(formulario.nome) &&
    !problemaDoIcone(formulario.icone) &&
    !problemaDoPrazo(formulario.slaDias) &&
    formulario.campos.every(
      (campo) => !Object.keys(problemasDoCampo(campo, formulario.campos)).length,
    )
  );
}

/**
 * Os erros que a API devolveu para os campos extras ("schema_atributos.0.chave") por posição
 * do campo; o que não aponta para um campo vai em `geral`.
 */
export function errosDosCamposExtras(campos: Record<string, string>): {
  porCampo: Record<number, ProblemasCampo>;
  geral: string | null;
} {
  const porCampo: Record<number, ProblemasCampo> = {};
  let geral: string | null = null;
  for (const [caminho, mensagem] of Object.entries(campos)) {
    const [raiz, indice, propriedade] = caminho.split('.');
    if (raiz !== 'schema_atributos') continue;
    const posicao = Number(indice);
    const alvo = ['chave', 'rotulo', 'min', 'max', 'opcoes'].includes(propriedade ?? '')
      ? (propriedade as keyof ProblemasCampo)
      : null;
    if (Number.isInteger(posicao) && alvo) {
      (porCampo[posicao] ??= {})[alvo] ??= mensagem;
    } else {
      geral ??= mensagem;
    }
  }
  return { porCampo, geral };
}
