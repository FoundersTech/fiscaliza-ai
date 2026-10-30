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

- [x] Cadastro e autenticação de usuários (cidadãos)
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
| Mapa           | Google Maps JavaScript API                 |
| Endereços      | Nominatim (OpenStreetMap)                  |
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

### Banco, Redis e storage locais

Precisa do Docker. O `docker-compose.yml` da raiz sobe o PostgreSQL 16 + PostGIS, o Redis 7 e um storage S3 (SeaweedFS, em `http://localhost:9100`) que faz o papel do Cloudflare R2:

```bash
pnpm infra:up
```

Na primeira vez, copie `apps/api/.env.example` para `apps/api/.env`. Depois, e sempre que chegar uma migration nova, aplique as migrations no banco local:

```bash
pnpm db:migrar
```

Em seguida, carregue os dados. O `db:seed:dev` aplica a carga inicial (Sorocaba, o órgão e as 4 categorias) e cria 1 usuário de teste por papel (`cidadao@`, `agente@`, `gestor@` e `admin@fiscaliza.test`, todos com a senha `fiscaliza123`) e 50 ocorrências, além dos buckets `fa-uploads` e `fa-fotos` no storage local. Ele só roda com `NODE_ENV=development` ou `test`. Em staging e produção, use só `pnpm db:seed`, com a carga inicial. Os dois podem rodar de novo sem duplicar nada:

```bash
pnpm db:seed:dev
```

Com o banco, o Redis e o storage de pé, rode também os testes de integração. Eles usam um banco à parte (`fiscaliza_teste`), recriado e migrado a cada execução, buckets à parte (`fa-uploads-teste` e `fa-fotos-teste`) e o banco 1 do Redis, para que uma API de desenvolvimento ligada não pegue os jobs dos testes:

```bash
pnpm test:int
```

Para desenvolver, rode `pnpm --filter @fiscaliza/api start:dev` (API em `http://localhost:3000/api/v1`, Swagger em `http://localhost:3000/docs`) e `pnpm --filter @fiscaliza/web dev` (PWA). Para desligar tudo, use `pnpm infra:down`.

### Fotos em desenvolvimento

O PWA envia cada foto direto ao storage, sem passar pela API: `POST /api/v1/uploads/intencao` devolve uma URL de PUT válida por 5 minutos, assinada para o tipo `image/jpeg` e para o tamanho exato informado (até 300 KB). Um PUT com outro tipo, outro tamanho ou depois do prazo é recusado com 403. Em desenvolvimento e nos testes, sem as variáveis `R2_*` no `.env`, a API usa o storage local do `docker-compose.yml`, com as credenciais de `deploy/local/s3.json`. Staging usa o R2 da Cloudflare.

Depois do registro da ocorrência, um job da própria API recodifica cada foto com o `sharp` (até 1600 px, miniatura de 400 px, sem EXIF nem GPS), publica no bucket `fa-fotos` e apaga o original do `fa-uploads`. Um arquivo que não é imagem fica `REJEITADA`. No storage local, o `fa-fotos` é público para leitura, como em staging: a foto fica em `http://localhost:9100/fa-fotos/<storage_key>`. A cada 10 minutos, um job de reconciliação põe de volta na fila as fotos e os endereços que ficaram para trás.

### E-mails em desenvolvimento

Em desenvolvimento, a API não envia e-mails: grava cada um em `apps/api/tmp/emails` (fora do Git). Abra o `.html` no navegador para ver o e-mail e clicar no link. Para conferir o envio real pelo Resend, defina `EMAIL_TRANSPORTE=resend` e `RESEND_API_KEY` no terminal, sem colocar a chave no `.env`, e rode:

```bash
pnpm email:teste --para voce@exemplo.com
```

O argumento vai direto depois do nome do script, sem `--`: com ele, o comando recusa o `--para`.

### Endereços e mapa em desenvolvimento

O `GET /api/v1/geo/reverso` busca o endereço no servidor público do Nominatim, então precisa de internet também em desenvolvimento. A API faz no máximo uma consulta a cada 1,1 s, como pede a política de uso do servidor, e guarda cada endereço no Redis por 30 dias; sem Redis, ou se o Nominatim demorar mais de 2 s, o endereço vem `null`. Para usar outro servidor, mude `NOMINATIM_URL` no `.env`.

O Map ID do Google Maps que o PWA recebe em `GET /api/v1/config/publica` vem de `GOOGLE_MAPS_MAP_ID`. Sem essa variável, vale o `DEMO_MAP_ID`, o Map ID de testes do Google.

### Administrador da plataforma

O primeiro `ADMIN_PLATAFORMA` nasce sem senha e recebe um convite por e-mail, válido por 72 horas, para definir a própria (em desenvolvimento, o e-mail fica em `apps/api/tmp/emails`):

```bash
pnpm criar-admin --email voce@exemplo.com --nome "Seu Nome"
```

O `--nome` é opcional. No container da API, rode `node dist/cli/criar-admin.js --email voce@exemplo.com`.

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

Os endereços vêm do OpenStreetMap: © colaboradores do OpenStreetMap, dados sob a licença [ODbL](https://opendatacommons.org/licenses/odbl/).
