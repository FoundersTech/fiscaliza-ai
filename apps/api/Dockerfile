# syntax=docker/dockerfile:1

# Imagem da API. O contexto do build é a raiz do monorepo:
#   docker build -f apps/api/Dockerfile .
# Em staging ela roda em ARM (Oracle A1); o workflow de deploy gera a variante linux/arm64.

FROM node:24-bookworm-slim AS base
# O Prisma precisa do OpenSSL para o motor de migrations.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# A versão do pnpm vem do campo packageManager do package.json da raiz.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @fiscaliza/api
RUN pnpm --filter @fiscaliza/api build
# Copia só o que o package.json lista em "files", com as dependências de produção.
# O prisma é dependência de produção porque as migrations rodam a partir desta imagem.
RUN pnpm --filter @fiscaliza/api deploy --prod /app

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
