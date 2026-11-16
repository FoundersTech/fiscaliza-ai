<script setup lang="ts">
import { POLITICA_VERSAO } from '@/services/politica';

const EMAIL_PRIVACIDADE = 'privacidade@fiscalizaai.app';
</script>

<template>
  <div class="politica">
    <p class="fa-sobrelinha politica__versao">Versão {{ POLITICA_VERSAO }}</p>

    <p>
      Esta política explica, de forma simples, quais dados o Fiscaliza Aí! usa, para quê, por quanto
      tempo e como você controla cada um deles, conforme a Lei Geral de Proteção de Dados (LGPD, Lei
      nº 13.709/2018).
    </p>

    <section>
      <h2>1. Dados coletados</h2>
      <ul>
        <li>
          <strong>Conta:</strong> nome, apelido público e e-mail. A senha é guardada só de forma
          protegida (criptografada), e ninguém da equipe consegue lê-la.
        </li>
        <li>
          <strong>Ocorrências:</strong> descrição, atributos do problema, localização no mapa,
          endereço aproximado e fotos. As fotos são reprocessadas e perdem os metadados (EXIF), como
          coordenadas de GPS, modelo do aparelho e data da captura.
        </li>
        <li>
          <strong>Participação:</strong> confirmações de problemas registrados por outras pessoas,
          avaliações do atendimento e pedidos de reabertura.
        </li>
        <li>
          <strong>Notificações:</strong> a inscrição de push do seu navegador, se você ativar os
          avisos.
        </li>
        <li>
          <strong>Registros técnicos:</strong> dados de sessão e de segurança, como endereço IP,
          navegador usado e horário de acesso.
        </li>
      </ul>
    </section>

    <section>
      <h2>2. Finalidade do tratamento</h2>
      <p>Usamos esses dados para:</p>
      <ul>
        <li>mostrar publicamente os problemas urbanos registrados no mapa e nas listas;</li>
        <li>encaminhar cada ocorrência ao órgão responsável pelo atendimento;</li>
        <li>avisar você quando o status de uma ocorrência sua mudar;</li>
        <li>calcular os indicadores públicos de atendimento da cidade;</li>
        <li>prevenir abuso, uso indevido e registros duplicados.</li>
      </ul>
      <p>
        Seu nome e seu e-mail nunca aparecem para outras pessoas. O apelido só é exibido junto às
        suas ocorrências se você escolher essa opção.
      </p>
    </section>

    <section>
      <h2>3. Base legal</h2>
      <p>Tratamos seus dados com base nas hipóteses previstas no art. 7º da LGPD:</p>
      <ul>
        <li>
          <strong>execução dos serviços que você solicita</strong>, como criar a conta, registrar
          ocorrências e receber avisos;
        </li>
        <li><strong>cumprimento de obrigação legal ou regulatória</strong>;</li>
        <li>
          <strong>legítimo interesse</strong> na transparência e na melhoria dos serviços públicos
          urbanos, sempre respeitando seus direitos e liberdades.
        </li>
      </ul>
    </section>

    <section>
      <h2>4. Retenção e segurança</h2>
      <ul>
        <li>
          O arquivo original de cada foto e seus metadados (EXIF) são apagados assim que a foto é
          processada; só a versão tratada fica guardada.
        </li>
        <li>
          Fotos enviadas que não chegaram a fazer parte de uma ocorrência são apagadas em 24 horas.
        </li>
        <li>
          Tokens de sessão expirados, com o IP e o navegador associados a eles, são apagados 30 dias
          depois de expirarem.
        </li>
        <li>O arquivo de exportação dos seus dados expira 7 dias depois de ficar pronto.</li>
        <li>As cópias de segurança (backups) do banco de dados são guardadas por 7 dias.</li>
      </ul>
      <p>
        O acesso aos dados é restrito, as conexões são protegidas e os arquivos ficam em
        armazenamento privado.
      </p>
    </section>

    <section>
      <h2>5. Direitos do titular</h2>
      <ul>
        <li>
          <strong>Cópia dos dados:</strong> em "Minha conta", você pede a exportação dos seus dados
          pessoais. Em até 48 horas, um arquivo JSON fica disponível para download nessa mesma tela.
        </li>
        <li>
          <strong>Apelido:</strong> você decide, a qualquer momento, se o seu apelido aparece ou não
          nas suas ocorrências.
        </li>
        <li>
          <strong>Exclusão da conta:</strong> você pode excluir a conta confirmando sua senha. Os
          dados pessoais são apagados ou anonimizados, e as ocorrências continuam públicas, sem
          vínculo com você e sem nenhuma informação que identifique quem as registrou.
        </li>
      </ul>
      <p>
        Você também pode pedir informações sobre o tratamento, a correção de dados incorretos ou
        tirar dúvidas pelo canal de contato abaixo.
      </p>
    </section>

    <section>
      <h2>6. Contato</h2>
      <p>
        Dúvidas ou solicitações sobre privacidade e proteção de dados podem ser enviadas para
        <a :href="`mailto:${EMAIL_PRIVACIDADE}`">{{ EMAIL_PRIVACIDADE }}</a
        >.
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.politica {
  line-height: 1.5;
  overflow-wrap: anywhere;

  p {
    margin: 0 0 12px;
  }

  h2 {
    margin: 20px 0 6px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--fa-texto);
  }

  ul {
    margin: 0 0 12px;
    padding-left: 20px;
  }

  li {
    margin-bottom: 6px;
    color: var(--fa-texto-2);

    strong {
      color: var(--fa-texto);
      font-weight: 600;
    }
  }

  a {
    color: var(--fa-azul);
    font-weight: 500;
  }

  section:last-child > p:last-child {
    margin-bottom: 0;
  }
}

.politica__versao {
  margin-bottom: 8px;
}
</style>
