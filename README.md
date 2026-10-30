# Fiscaliza Aí! 🏙️

> Um "Reclame Aqui" da infraestrutura urbana: cidadãos reportam problemas, a prefeitura ganha (ou perde) pontos por resolvê-los.

## 📋 Sobre o projeto

**Fiscaliza Aí!** é um projeto acadêmico (UPX) que propõe uma forma centralizada e transparente de acompanhar a manutenção da infraestrutura urbana de um município.

A ideia nasce de um problema comum: reclamações sobre buracos na rua, postes de luz apagados, terrenos abandonados e outros problemas urbanos costumam ficar espalhadas — em redes sociais, ligações para a prefeitura, boca a boca — sem nenhum acompanhamento real do que foi resolvido e do que ficou parado.

O Fiscaliza Aí! resolve isso concentrando tudo em um só lugar: o cidadão registra o problema, a comunidade acompanha, e a gestão pública é avaliada por sua capacidade de resposta.

## ✨ Como funciona

1. **Identificação do problema** — o cidadão encontra um problema de infraestrutura urbana (rua esburacada, poste sem funcionar, terreno sujo, iluminação pública, etc).
2. **Registro da notificação** — tira uma foto do problema, escreve uma breve descrição e envia junto com a localização exata (geolocalização).
3. **Centralização** — a notificação fica visível no app, gerando visibilidade e pressão pública por uma solução.
4. **Resolução e pontuação** — conforme a prefeitura resolve os problemas reportados, ela acumula _score_.
5. **Avaliação pública** — esse score funciona como um indicador de desempenho da gestão pública municipal, acessível a todos.

## 🎯 Objetivo

Dar aos cidadãos uma ferramenta simples para reportar problemas urbanos e, ao mesmo tempo, criar um mecanismo público e mensurável de cobrança e avaliação da gestão municipal — incentivando prefeituras a agir mais rápido e com mais transparência.

## 🗺️ Roadmap (alto nível)

- [ ] Cadastro e autenticação de usuários (cidadãos)
- [ ] Envio de notificação (foto + descrição + geolocalização)
- [ ] Listagem/mapa de notificações por região
- [ ] Fluxo de atualização de status pela prefeitura (recebido → em andamento → resolvido)
- [ ] Cálculo e exibição do score da gestão municipal
- [ ] Painel público de acompanhamento

> Este roadmap é conceitual e será refinado conforme o projeto evolui.

## 🛠️ Stack

| Camada         | Tecnologia                                 |
| -------------- | ------------------------------------------ |
| Frontend (PWA) | Quasar 2 (app-vite 3) + Vue 3 + TypeScript |
| Backend        | NestJS 12 (ESM) + Fastify, Node 24         |
| Banco          | PostgreSQL 16 + PostGIS 3, Prisma 7        |
| Fila e cache   | Redis 7 + BullMQ 5                         |
| Storage        | Cloudflare R2                              |
| Testes         | Vitest                                     |

Monorepo pnpm, TypeScript 6 estrito, ESLint e Prettier.

### Estrutura

| Pasta                | Conteúdo                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`           | API NestJS + Fastify. Cada módulo em `src/modules/<modulo>/{domain,application,infrastructure,presentation}`.                                                                         |
| `apps/web`           | PWA Quasar. O service worker e o manifest ficam em `apps/web/src-pwa`, que tem lockfile próprio: o Quasar instala as dependências dessa pasta sozinho no `quasar prepare` e no build. |
| `packages/contratos` | Tipos da API gerados do OpenAPI.                                                                                                                                                      |

### Regras que o lint garante

- `domain/` não importa `@nestjs/*`, `@prisma/*` nem as outras camadas; `application/` não importa `@prisma/*`, `infrastructure/` nem `presentation/` (Arquitetura Limpa).
- SQL cru só com `$queryRaw` / `$executeRaw` em template; `$queryRawUnsafe` e `$executeRawUnsafe` são proibidos.
- `v-html` é proibido no PWA (proteção contra XSS).
- Formatação pelo Prettier (`pnpm format`).

## 🚀 Como rodar o projeto

Requisitos: Node 24 (ver `.nvmrc`) e pnpm 12 (`npm install -g pnpm`).

```bash
pnpm install
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm build
```

### Banco e Redis locais

Precisa do Docker. O `docker-compose.yml` da raiz sobe o PostgreSQL 16 + PostGIS e o Redis 7:

```bash
pnpm infra:up
```

Na primeira vez, copie `apps/api/.env.example` para `apps/api/.env`. Depois, e sempre que chegar uma migration nova, aplique as migrations no banco local:

```bash
pnpm db:migrar
```

Em seguida, carregue os dados. O `db:seed:dev` aplica a carga inicial (Sorocaba, o órgão e as 4 categorias) e cria 1 usuário de teste por papel (`cidadao@`, `agente@`, `gestor@` e `admin@fiscaliza.test`) e 50 ocorrências. Ele só roda com `NODE_ENV=development` ou `test`. Em staging e produção, use só `pnpm db:seed`, com a carga inicial. Os dois podem rodar de novo sem duplicar nada:

```bash
pnpm db:seed:dev
```

Com o banco e o Redis de pé, rode também os testes de integração. Eles usam um banco à parte (`fiscaliza_teste`), recriado e migrado a cada execução:

```bash
pnpm test:int
```

Para desenvolver, rode `pnpm --filter @fiscaliza/api start:dev` (API em `http://localhost:3000/api/v1`, Swagger em `http://localhost:3000/docs`) e `pnpm --filter @fiscaliza/web dev` (PWA). Para desligar o banco e o Redis, use `pnpm infra:down`.

### E-mails em desenvolvimento

Em desenvolvimento, a API não envia e-mails: grava cada um em `apps/api/tmp/emails` (fora do Git). Abra o `.html` no navegador para ver o e-mail e clicar no link. Para conferir o envio real pelo Resend, defina `EMAIL_TRANSPORTE=resend` e `RESEND_API_KEY` no terminal, sem colocar a chave no `.env`, e rode:

```bash
pnpm email:teste -- --para voce@exemplo.com
```

### Contratos da API

Depois de mudar qualquer rota ou DTO da API, regenere os tipos usados pelo PWA e commite `packages/contratos` junto (não precisa de banco nem Redis):

```bash
pnpm contratos:gerar
```

O CI falha se os contratos versionados não baterem com a API.

### Mudanças no banco

O schema fica em `apps/api/prisma/schema.prisma`. Ao mudá-lo, crie a migration sem aplicar:

```bash
pnpm db:migrar --create-only --name descricao-da-mudanca
```

O Prisma não gera CHECKs, índices de expressão (como o de `lower(email)`) nem colunas geradas. Se a mudança envolver uma dessas regras, escreva o SQL à mão no `migration.sql` gerado e depois rode `pnpm db:migrar` para aplicar. Os testes de integração falham se o `schema.prisma` e as migrations divergirem.

### Staging

Todo merge na `main` que passa no CI é publicado sozinho pelo workflow **Deploy staging**:

- API: <https://api-staging.fiscalizaai.app/api/v1/health> (o campo `versao` mostra o commit no ar) e Swagger em `/docs`;
- PWA: <https://app-staging.fiscalizaai.app>.

A API roda numa VM ARM do Oracle Cloud com o Docker Compose de `deploy/staging` (API, PostgreSQL com PostGIS, Redis e Caddy). As migrations rodam antes de a API nova subir; se falharem, a versão anterior continua no ar. Para publicar de novo sem um merge, use **Actions → Deploy staging → Run workflow**. Os segredos ficam no environment `staging` do GitHub; nenhum vai para o repositório.

## 👥 Equipe

| Nome           | GitHub                                           |
| -------------- | ------------------------------------------------ |
| Allan Felipe   | [@AllanFelipeh](https://github.com/AllanFelipeh) |
| Bruno Pocay    | [@BrunoPocay](https://github.com/brunopocay)     |
| Giovane Vieira | [@GiovaneVieira](https://github.com/GiihVieira)  |
| Jorge Tardelli | [@JorgeTardelli](<>)                             |
| Kauan Mello    | [@KuanMello](https://github.com/nauakcode)       |
| Larissa ...    | [@Larissa...](https://github.com/...)            |

## 📄 Licença

MIT License
