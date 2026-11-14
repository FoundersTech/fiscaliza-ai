-- Índices das consultas públicas, medidos com 200 mil ocorrências (apps/api/carga/README.md).
-- Os dois ficam só no SQL: o Prisma não representa índice parcial nem índice de expressão.

-- Feed e mapa ordenados da mais recente para a mais antiga, só com os status visíveis ao
-- público. Numa área grande do mapa (a cidade inteira), o banco percorre este índice já na
-- ordem e para nos primeiros 2.000 pontos, em vez de ordenar todas as ocorrências da área.
CREATE INDEX "ocorrencia_publica_criada_em_idx" ON "ocorrencia" ("criada_em" DESC, "id" DESC)
    WHERE "status" IN ('RECEBIDA', 'EM_ANALISE', 'EM_EXECUCAO', 'RESOLVIDA');

-- Ponto público como geometry: o filtro do mapa (ponto dentro do retângulo da tela) usa este
-- índice, e o ANALYZE guarda estatísticas dele, o que permite ao planejador estimar quantos
-- pontos cabem na área e escolher entre este índice e o de cima.
CREATE INDEX "ocorrencia_local_publico_idx" ON "ocorrencia" USING GIST (("local_publico"::geometry));
