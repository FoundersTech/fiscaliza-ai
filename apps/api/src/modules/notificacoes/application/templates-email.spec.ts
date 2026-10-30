import { describe, expect, it } from 'vitest';

import { emailConvite, emailRedefinicaoSenha } from './templates-email.js';

const LINK = 'https://app.exemplo.test/definir-senha?token=abc&x=1';

describe('emailRedefinicaoSenha', () => {
  const email = emailRedefinicaoSenha({ nome: 'Ana', link: LINK });

  it('traz assunto, saudação, validade de 1 hora e o link nas duas versões', () => {
    expect(email.assunto).toBe('Redefinição de senha do Fiscaliza Aí!');
    expect(email.texto).toContain('Olá, Ana!');
    expect(email.texto).toContain('1 hora');
    expect(email.texto).toContain(LINK);
    expect(email.html).toContain('1 hora');
    expect(email.html).toContain(`href="${LINK.replace('&', '&amp;')}"`);
  });

  it('avisa quem não pediu a redefinição', () => {
    expect(email.texto).toContain('Se você não pediu a redefinição, ignore este e-mail');
  });
});

describe('emailConvite', () => {
  it('convite de agente cita o órgão e a validade de 72 horas', () => {
    const email = emailConvite({
      nome: 'Beto',
      link: LINK,
      papel: 'AGENTE_ORGAO',
      orgao: 'Prefeitura de Sorocaba',
    });

    expect(email.assunto).toBe('Seu convite para o Fiscaliza Aí!');
    expect(email.texto).toContain('como agente de Prefeitura de Sorocaba');
    expect(email.texto).toContain('72 horas');
    expect(email.texto).toContain(LINK);
  });

  it.each([
    ['ADMIN_MUNICIPIO', 'gerenciar o órgão e os agentes do seu município'],
    ['ADMIN_PLATAFORMA', 'administrar a plataforma'],
  ] as const)('convite de %s descreve o papel', (papel, descricao) => {
    expect(emailConvite({ nome: 'Cris', link: LINK, papel }).texto).toContain(descricao);
  });
});

describe('templates: dados vindos do usuário', () => {
  it('escapam HTML no nome, sem mexer na versão em texto', () => {
    const nome = '<script>alert("x")</script> & Cia';
    const email = emailRedefinicaoSenha({ nome, link: LINK });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Cia');
    expect(email.texto).toContain(nome);
  });
});
