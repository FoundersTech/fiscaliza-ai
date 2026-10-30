import type { MensagemEmail } from './email.port.js';

export type ConteudoEmail = Omit<MensagemEmail, 'para'>;

/** Validade dos links, igual à de `token_acesso.expira_em`. */
export const VALIDADE_HORAS = { redefinicao: 1, convite: 72 } as const;

/** Papéis que entram por convite; o cidadão se cadastra sozinho. */
export type PapelConvidado = 'AGENTE_ORGAO' | 'ADMIN_MUNICIPIO' | 'ADMIN_PLATAFORMA';

export interface DadosRedefinicao {
  nome: string;
  link: string;
}

export interface DadosConvite {
  nome: string;
  link: string;
  papel: PapelConvidado;
  /** Nome do órgão, quando o convite é de agente. */
  orgao?: string;
}

export function emailRedefinicaoSenha({ nome, link }: DadosRedefinicao): ConteudoEmail {
  const validade = descreverValidade(VALIDADE_HORAS.redefinicao);
  return montar({
    assunto: 'Redefinição de senha do Fiscaliza Aí!',
    nome,
    paragrafos: [
      'Recebemos um pedido para redefinir a senha da sua conta no Fiscaliza Aí!.',
      `Use o botão abaixo para criar uma senha nova. O link vale por ${validade} e só pode ser usado uma vez.`,
    ],
    botao: 'Criar nova senha',
    link,
    rodape: 'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
  });
}

export function emailConvite({ nome, link, papel, orgao }: DadosConvite): ConteudoEmail {
  const validade = descreverValidade(VALIDADE_HORAS.convite);
  return montar({
    assunto: 'Seu convite para o Fiscaliza Aí!',
    nome,
    paragrafos: [
      `Você foi convidado(a) para o Fiscaliza Aí! para ${descreverPapel(papel, orgao)}.`,
      `Para entrar, defina sua senha pelo botão abaixo. O link vale por ${validade} e só pode ser usado uma vez.`,
    ],
    botao: 'Definir minha senha',
    link,
    rodape: 'Se você não esperava este convite, ignore este e-mail.',
  });
}

function descreverPapel(papel: PapelConvidado, orgao?: string): string {
  switch (papel) {
    case 'AGENTE_ORGAO':
      return orgao ? `atender as ocorrências como agente de ${orgao}` : 'atender as ocorrências';
    case 'ADMIN_MUNICIPIO':
      return 'gerenciar o órgão e os agentes do seu município';
    case 'ADMIN_PLATAFORMA':
      return 'administrar a plataforma';
  }
}

function descreverValidade(horas: number): string {
  return horas === 1 ? '1 hora' : `${horas} horas`;
}

interface Partes {
  assunto: string;
  nome: string;
  paragrafos: string[];
  botao: string;
  link: string;
  rodape: string;
}

/** Monta o HTML (com os dados escapados) e a versão em texto do mesmo conteúdo. */
function montar({ assunto, nome, paragrafos, botao, link, rodape }: Partes): ConteudoEmail {
  const saudacao = `Olá, ${nome}!`;

  const texto = [saudacao, ...paragrafos, `${botao}: ${link}`, rodape, '— Fiscaliza Aí!'].join(
    '\n\n',
  );

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <p style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#1565c0">Fiscaliza Aí!</p>
    <p style="margin:0 0 16px">${escapar(saudacao)}</p>
${paragrafos.map((paragrafo) => `    <p style="margin:0 0 16px">${escapar(paragrafo)}</p>`).join('\n')}
    <p style="margin:24px 0">
      <a href="${escapar(link)}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${escapar(botao)}</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#5b6475">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(link)}</p>
    <p style="margin:0;font-size:13px;color:#5b6475">${escapar(rodape)}</p>
  </div>
</body>
</html>
`;

  return { assunto, html, texto };
}

const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** O nome vem do cadastro: sem escapar, viraria HTML no e-mail. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (caractere) => ENTIDADES[caractere]!);
}
