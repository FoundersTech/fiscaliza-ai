-- Schema inicial do MVP (T-06). Gerado com `prisma migrate diff` e completado à mão com o que
-- o Prisma não representa: extensão PostGIS, coluna gerada, índice em lower(email) e CHECKs
-- (seção "Regras que o Prisma não representa", no fim do arquivo).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS postgis;
-- CreateEnum
CREATE TYPE "papel_usuario" AS ENUM ('CIDADAO', 'AGENTE_ORGAO', 'ADMIN_MUNICIPIO', 'ADMIN_PLATAFORMA');

-- CreateEnum
CREATE TYPE "status_ocorrencia" AS ENUM ('RECEBIDA', 'EM_ANALISE', 'EM_EXECUCAO', 'RESOLVIDA', 'RECUSADA', 'DUPLICADA');

-- CreateEnum
CREATE TYPE "status_moderacao" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "tipo_token" AS ENUM ('REDEFINIR_SENHA', 'CONVITE');

-- CreateEnum
CREATE TYPE "status_exportacao" AS ENUM ('PROCESSANDO', 'PRONTA', 'FALHOU', 'EXPIRADA');

-- CreateTable
CREATE TABLE "municipio" (
    "id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "sigla" CHAR(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "area" geometry(MultiPolygon, 4326) NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bairro" (
    "id" SERIAL NOT NULL,
    "municipio_id" INTEGER NOT NULL,
    "codigo_ibge" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "area" geometry(MultiPolygon, 4326) NOT NULL,

    CONSTRAINT "bairro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orgao" (
    "id" SERIAL NOT NULL,
    "municipio_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "orgao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SMALLSERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "sla_dias" SMALLINT NOT NULL,
    "schema_atributos" JSONB NOT NULL DEFAULT '[]',
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "apelido_publico" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT,
    "papel" "papel_usuario" NOT NULL,
    "municipio_id" INTEGER,
    "orgao_id" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "politica_versao" TEXT,
    "politica_aceita_em" TIMESTAMPTZ(6),
    "alertas_vistos_em" TIMESTAMPTZ(6),
    "anonimizado_em" TIMESTAMPTZ(6),
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "usado_em" TIMESTAMPTZ(6),
    "revogado_em" TIMESTAMPTZ(6),
    "ip" INET,
    "user_agent" TEXT,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_acesso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_token" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_em" TIMESTAMPTZ(6) NOT NULL,
    "usado_em" TIMESTAMPTZ(6),

    CONSTRAINT "token_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_inscricao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_erro_em" TIMESTAMPTZ(6),

    CONSTRAINT "push_inscricao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exportacao_dados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "status" "status_exportacao" NOT NULL DEFAULT 'PROCESSANDO',
    "storage_key" TEXT,
    "solicitada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pronta_em" TIMESTAMPTZ(6),
    "expira_em" TIMESTAMPTZ(6),

    CONSTRAINT "exportacao_dados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocorrencia" (
    "id" UUID NOT NULL,
    "protocolo" TEXT NOT NULL,
    "autor_id" UUID,
    "publicar_autor" BOOLEAN NOT NULL DEFAULT false,
    "categoria_id" SMALLINT NOT NULL,
    "municipio_id" INTEGER NOT NULL,
    "orgao_id" INTEGER NOT NULL,
    "bairro_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "atributos" JSONB NOT NULL DEFAULT '{}',
    "local" geography(Point, 4326) NOT NULL,
    -- Igual a local no MVP (RN-15); a coluna fica para um borramento futuro.
    "local_publico" geography(Point, 4326) GENERATED ALWAYS AS ("local") STORED,
    "precisao_m" SMALLINT,
    "endereco" TEXT,
    "status" "status_ocorrencia" NOT NULL DEFAULT 'RECEBIDA',
    "duplicada_de_id" UUID,
    "reaberturas" SMALLINT NOT NULL DEFAULT 0,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triada_em" TIMESTAMPTZ(6),
    "resolvida_em" TIMESTAMPTZ(6),

    CONSTRAINT "ocorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocorrencia_foto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ocorrencia_id" UUID NOT NULL,
    "ordem" SMALLINT NOT NULL,
    "upload_key" TEXT,
    "storage_key" TEXT,
    "miniatura_key" TEXT,
    "largura" INTEGER,
    "altura" INTEGER,
    "bytes" INTEGER,
    "moderacao" "status_moderacao" NOT NULL DEFAULT 'PENDENTE',
    "motivo_rejeicao" TEXT,
    "exif_removido_em" TIMESTAMPTZ(6),
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocorrencia_foto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocorrencia_evento" (
    "id" SERIAL NOT NULL,
    "ocorrencia_id" UUID NOT NULL,
    "de_status" "status_ocorrencia",
    "para_status" "status_ocorrencia" NOT NULL,
    "autor_id" UUID,
    "orgao_id" INTEGER,
    "comentario" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocorrencia_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confirmacao" (
    "ocorrencia_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confirmacao_pkey" PRIMARY KEY ("ocorrencia_id","usuario_id")
);

-- CreateTable
CREATE TABLE "avaliacao" (
    "ocorrencia_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "nota" SMALLINT NOT NULL,
    "comentario" TEXT,
    "criada_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacao_pkey" PRIMARY KEY ("ocorrencia_id","usuario_id")
);

-- CreateTable
CREATE TABLE "protocolo_sequencia" (
    "municipio_id" INTEGER NOT NULL,
    "ano" SMALLINT NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "protocolo_sequencia_pkey" PRIMARY KEY ("municipio_id","ano")
);

-- CreateTable
CREATE TABLE "desempenho_orgao" (
    "orgao_id" INTEGER NOT NULL,
    "municipio_id" INTEGER NOT NULL,
    "janela_dias" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "resolvidas" INTEGER NOT NULL,
    "no_prazo" INTEGER NOT NULL,
    "avaliacoes" INTEGER NOT NULL,
    "dias_mediana" DECIMAL,
    "satisfacao_media" DECIMAL,
    "score" DECIMAL(3,1),
    "classificacao" TEXT,
    "por_categoria" JSONB NOT NULL DEFAULT '[]',
    "calculado_em" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "desempenho_orgao_pkey" PRIMARY KEY ("orgao_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipio_sigla_key" ON "municipio"("sigla");

-- CreateIndex
CREATE INDEX "municipio_area_idx" ON "municipio" USING GIST ("area");

-- CreateIndex
CREATE UNIQUE INDEX "bairro_codigo_ibge_key" ON "bairro"("codigo_ibge");

-- CreateIndex
CREATE INDEX "bairro_municipio_id_idx" ON "bairro"("municipio_id");

-- CreateIndex
CREATE INDEX "bairro_area_idx" ON "bairro" USING GIST ("area");

-- CreateIndex
CREATE UNIQUE INDEX "orgao_municipio_id_key" ON "orgao"("municipio_id");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_slug_key" ON "categoria"("slug");

-- CreateIndex
CREATE INDEX "usuario_municipio_id_idx" ON "usuario"("municipio_id");

-- CreateIndex
CREATE INDEX "usuario_orgao_id_idx" ON "usuario"("orgao_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_usuario_id_idx" ON "refresh_token"("usuario_id");

-- CreateIndex
CREATE INDEX "refresh_token_familia_id_idx" ON "refresh_token"("familia_id");

-- CreateIndex
CREATE INDEX "refresh_token_expira_em_idx" ON "refresh_token"("expira_em");

-- CreateIndex
CREATE UNIQUE INDEX "token_acesso_token_hash_key" ON "token_acesso"("token_hash");

-- CreateIndex
CREATE INDEX "token_acesso_usuario_id_idx" ON "token_acesso"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_inscricao_endpoint_key" ON "push_inscricao"("endpoint");

-- CreateIndex
CREATE INDEX "push_inscricao_usuario_id_idx" ON "push_inscricao"("usuario_id");

-- CreateIndex
CREATE INDEX "exportacao_dados_usuario_id_idx" ON "exportacao_dados"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "ocorrencia_protocolo_key" ON "ocorrencia"("protocolo");

-- CreateIndex
CREATE INDEX "ocorrencia_municipio_id_criada_em_id_idx" ON "ocorrencia"("municipio_id", "criada_em" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ocorrencia_orgao_id_status_criada_em_idx" ON "ocorrencia"("orgao_id", "status", "criada_em");

-- CreateIndex
CREATE INDEX "ocorrencia_autor_id_idx" ON "ocorrencia"("autor_id");

-- CreateIndex
CREATE INDEX "ocorrencia_local_idx" ON "ocorrencia" USING GIST ("local");

-- CreateIndex
CREATE INDEX "ocorrencia_atributos_idx" ON "ocorrencia" USING GIN ("atributos");

-- CreateIndex
CREATE UNIQUE INDEX "ocorrencia_foto_storage_key_key" ON "ocorrencia_foto"("storage_key");

-- CreateIndex
CREATE INDEX "ocorrencia_foto_moderacao_idx" ON "ocorrencia_foto"("moderacao");

-- CreateIndex
CREATE UNIQUE INDEX "ocorrencia_foto_ocorrencia_id_ordem_key" ON "ocorrencia_foto"("ocorrencia_id", "ordem");

-- CreateIndex
CREATE INDEX "ocorrencia_evento_ocorrencia_id_criado_em_idx" ON "ocorrencia_evento"("ocorrencia_id", "criado_em");

-- CreateIndex
CREATE INDEX "confirmacao_usuario_id_idx" ON "confirmacao"("usuario_id");

-- CreateIndex
CREATE INDEX "avaliacao_usuario_id_idx" ON "avaliacao"("usuario_id");

-- AddForeignKey
ALTER TABLE "bairro" ADD CONSTRAINT "bairro_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orgao" ADD CONSTRAINT "orgao_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_orgao_id_fkey" FOREIGN KEY ("orgao_id") REFERENCES "orgao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_acesso" ADD CONSTRAINT "token_acesso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_inscricao" ADD CONSTRAINT "push_inscricao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exportacao_dados" ADD CONSTRAINT "exportacao_dados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_orgao_id_fkey" FOREIGN KEY ("orgao_id") REFERENCES "orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_bairro_id_fkey" FOREIGN KEY ("bairro_id") REFERENCES "bairro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia" ADD CONSTRAINT "ocorrencia_duplicada_de_id_fkey" FOREIGN KEY ("duplicada_de_id") REFERENCES "ocorrencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia_foto" ADD CONSTRAINT "ocorrencia_foto_ocorrencia_id_fkey" FOREIGN KEY ("ocorrencia_id") REFERENCES "ocorrencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia_evento" ADD CONSTRAINT "ocorrencia_evento_ocorrencia_id_fkey" FOREIGN KEY ("ocorrencia_id") REFERENCES "ocorrencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia_evento" ADD CONSTRAINT "ocorrencia_evento_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocorrencia_evento" ADD CONSTRAINT "ocorrencia_evento_orgao_id_fkey" FOREIGN KEY ("orgao_id") REFERENCES "orgao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacao" ADD CONSTRAINT "confirmacao_ocorrencia_id_fkey" FOREIGN KEY ("ocorrencia_id") REFERENCES "ocorrencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confirmacao" ADD CONSTRAINT "confirmacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_ocorrencia_id_fkey" FOREIGN KEY ("ocorrencia_id") REFERENCES "ocorrencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocolo_sequencia" ADD CONSTRAINT "protocolo_sequencia_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desempenho_orgao" ADD CONSTRAINT "desempenho_orgao_orgao_id_fkey" FOREIGN KEY ("orgao_id") REFERENCES "orgao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desempenho_orgao" ADD CONSTRAINT "desempenho_orgao_municipio_id_fkey" FOREIGN KEY ("municipio_id") REFERENCES "municipio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Regras que o Prisma não representa
-- ---------------------------------------------------------------------------

-- E-mail único sem diferenciar maiúsculas (CA-01.2).
CREATE UNIQUE INDEX "usuario_email_lower_key" ON "usuario" (lower("email"));

-- municipio
ALTER TABLE "municipio"
    ADD CONSTRAINT "municipio_uf_check" CHECK ("uf" ~ '^[A-Z]{2}$'),
    ADD CONSTRAINT "municipio_sigla_check" CHECK ("sigla" ~ '^[A-Z]{3}$');

-- categoria
ALTER TABLE "categoria"
    ADD CONSTRAINT "categoria_slug_check" CHECK ("slug" ~ '^[a-z0-9-]{2,40}$'),
    ADD CONSTRAINT "categoria_sla_dias_check" CHECK ("sla_dias" > 0),
    ADD CONSTRAINT "categoria_schema_atributos_check" CHECK (jsonb_typeof("schema_atributos") = 'array');

-- usuario
ALTER TABLE "usuario"
    ADD CONSTRAINT "usuario_apelido_publico_check" CHECK (char_length("apelido_publico") BETWEEN 2 AND 30),
    ADD CONSTRAINT "usuario_agente_orgao_check" CHECK ("papel" <> 'AGENTE_ORGAO' OR "orgao_id" IS NOT NULL),
    ADD CONSTRAINT "usuario_admin_municipio_check" CHECK ("papel" <> 'ADMIN_MUNICIPIO' OR "municipio_id" IS NOT NULL);

-- ocorrencia
ALTER TABLE "ocorrencia"
    ADD CONSTRAINT "ocorrencia_protocolo_check" CHECK ("protocolo" ~ '^FA-[0-9]{4}-[A-Z]{3}-[0-9]{6}$'),
    ADD CONSTRAINT "ocorrencia_descricao_check" CHECK (char_length("descricao") BETWEEN 10 AND 500),
    ADD CONSTRAINT "ocorrencia_atributos_check" CHECK (jsonb_typeof("atributos") = 'object'),
    ADD CONSTRAINT "ocorrencia_precisao_m_check" CHECK ("precisao_m" >= 0),
    ADD CONSTRAINT "ocorrencia_reaberturas_check" CHECK ("reaberturas" >= 0),
    ADD CONSTRAINT "ocorrencia_duplicada_de_id_check" CHECK ("duplicada_de_id" <> "id");

-- ocorrencia_foto (até 2 fotos, Q-14)
ALTER TABLE "ocorrencia_foto"
    ADD CONSTRAINT "ocorrencia_foto_ordem_check" CHECK ("ordem" IN (1, 2));

-- avaliacao
ALTER TABLE "avaliacao"
    ADD CONSTRAINT "avaliacao_nota_check" CHECK ("nota" BETWEEN 1 AND 5),
    ADD CONSTRAINT "avaliacao_comentario_check" CHECK (char_length("comentario") <= 500);

-- protocolo_sequencia
ALTER TABLE "protocolo_sequencia"
    ADD CONSTRAINT "protocolo_sequencia_ultimo_check" CHECK ("ultimo" >= 0);

-- desempenho_orgao
ALTER TABLE "desempenho_orgao"
    ADD CONSTRAINT "desempenho_orgao_score_check" CHECK ("score" BETWEEN 0 AND 10);
