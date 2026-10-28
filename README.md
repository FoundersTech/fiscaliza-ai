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
| Banco          | PostgreSQL 16 + PostGIS 3                  |
| Fila e cache   | Redis + BullMQ                             |
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

Para desenvolver, rode `pnpm --filter @fiscaliza/api start:dev` (API) e `pnpm --filter @fiscaliza/web dev` (PWA).

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
