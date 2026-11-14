# Teste de carga

Confere se o feed e o mapa públicos respondem com p95 ≤ 500 ms com 200 mil ocorrências. O detalhe
entra junto, para acompanhar. Tudo roda num banco à parte (`fiscaliza_carga`), criado pelo script e
apagado no fim; o banco de desenvolvimento, o de testes e o de staging não são tocados.

| Peça                          | O que faz                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `src/cli/carga-sintetica.ts`  | `gerar` recria o banco sintético e o enche; `apagar` o remove.                             |
| `carga/k6/feed.js`            | Feed de Sorocaba: 60% só a primeira página, o resto rola até 5 páginas pelo cursor.        |
| `carga/k6/mapa.js`            | Mapa: cidade inteira (25%), um bairro (45%) e algumas ruas (30%), em pontos aleatórios.    |
| `carga/k6/detalhe.js`         | Detalhe de ocorrências sorteadas entre 1.000 ids tirados do feed no `setup`.               |
| `carga/k6/comum.js`           | Carga (padrão: sobe a 50 usuários em 15 s, 1 min no patamar), limites e filtros.           |
| `LIMITE_TAXA_DESLIGADO` (API) | Desliga o limite de requisições por IP. Só na API do teste, nunca na que atende o público. |

## O banco sintético

`node dist/cli/carga-sintetica.js gerar [quantidade]` (padrão: 200 mil) apaga o banco do
`DATABASE_URL`, cria de novo, aplica as migrations e a carga inicial (Sorocaba, órgão e categorias)
e gera tudo dentro do Postgres com `INSERT … SELECT generate_series` (cerca de 40 s numa máquina de
desenvolvimento):

- 5.000 cidadãos;
- 200 mil ocorrências em pontos dentro do polígono de Sorocaba, 60% concentrados perto do centro e
  40% espalhados; dois anos de histórico, com mais ocorrências recentes; status em proporção de uso
  real (30% recebidas, 30% em andamento, 30% resolvidas, 10% recusadas ou duplicadas); protocolo
  sequencial por ano;
- eventos de criação e de triagem (cerca de 340 mil), uma foto aprovada em 85% das ocorrências e
  cerca de 410 mil confirmações ("Também vi"), algumas ocorrências com muitas;
- `ANALYZE` no fim, para o planejador do Postgres conhecer os dados.

Por segurança, o script recusa qualquer banco cujo nome não comece com `fiscaliza_carga`.

## Rodando na máquina local

Pré-requisitos: `pnpm infra:up` (Postgres e Redis do docker-compose da raiz) e Docker para o k6.
Os comandos abaixo são do Git Bash, a partir de `apps/api`.

```bash
pnpm build

# 1. Banco sintético
DATABASE_URL=postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza_carga pnpm carga gerar

# 2. API compilada (não o modo watch) numa porta e num banco do Redis só dela.
#    Sem o limite por IP: o k6 manda tudo de um IP só, e passaria das 120 leituras por minuto.
#    LOG_LEVEL=warn para o log de cada requisição não entrar na medição.
PORT=3148 NODE_ENV=development LOG_LEVEL=warn LIMITE_TAXA_DESLIGADO=true \
  DATABASE_URL=postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza_carga \
  REDIS_URL=redis://localhost:6379/5 node dist/main.js

# 3. Em outro terminal, os três cenários (a imagem fica fixa em uma versão do k6)
for cenario in feed mapa detalhe; do
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/carga/k6:/scripts" \
    grafana/k6:1.3.0 run /scripts/$cenario.js
done

# 4. Pare a API (Ctrl+C) e apague o banco sintético
DATABASE_URL=postgresql://fiscaliza:fiscaliza@localhost:5432/fiscaliza_carga pnpm carga apagar
```

Variáveis do k6 (com `-e NOME=valor` no `docker run … run`): `BASE_URL` (padrão
`http://host.docker.internal:3148/api/v1`), `VUS` (padrão 50) e `DURACAO` do patamar (padrão `1m`).
Cada cenário falha (código de saída diferente de zero) se o p95 passar de 500 ms ou se mais de 1%
das requisições der erro. No Linux, troque `$(pwd -W)` por `$(pwd)` e acrescente
`--add-host=host.docker.internal:host-gateway`.

## Resultados (14/11/2026, máquina local)

Máquina de desenvolvimento Windows 11 com Docker Desktop: Postgres e Redis em contêiner, API em
Node 24 direto no Windows, k6 em contêiner. Staging (VM ARM da Oracle, Caddy na frente, HTTPS) pode
dar números diferentes; o roteiro de staging está abaixo.

Banco: 200.000 ocorrências, 339.660 eventos, 169.816 fotos, 413.641 confirmações. Carga: 50 usuários
virtuais, 1 min no patamar, de 0,5 a 1,5 s entre chamadas.

| Cenário | Antes dos índices | Depois dos índices                             |
| ------- | ----------------- | ---------------------------------------------- |
| Mapa    | p95 = 1,22 s ✗    | p95 = 72 ms (mediana 33 ms, 3.397 req, 0 erro) |
| Feed    | (não medido)      | p95 = 15 ms (mediana 5 ms, 3.522 req, 0 erro)  |
| Detalhe | (não medido)      | p95 = 10 ms (mediana 6 ms, 3.515 req, 0 erro)  |

Cada cenário rodou a cerca de 42 requisições por segundo. Para ver a folga, mapa e feed rodaram
também com 200 usuários (`-e VUS=200`): o feed aguentou 168 req/s com p95 = 54 ms; o mapa parou em
62 req/s, com p95 = 4,6 s. Ali o gargalo já não é o banco (a consulta leva ~16 ms), e sim montar e
enviar respostas de até 2.000 pontos (~350 KB cada) num processo Node só, passando pela rede do
Docker Desktop. Se o mapa precisar de mais vazão, o caminho é devolver menos pontos (agrupar no
servidor) ou comprimir a resposta, não mais índice.

O que mudou no mapa (migration `20261114120000_indices_feed_e_mapa_publicos`):

- **Antes:** o filtro da área usava o índice de `local` (geography) e conferia de novo com
  `ST_Intersects` no ponto público. O planejador não tinha como estimar quantos pontos cabem na
  área: com a cidade inteira na tela, lia as ~180 mil ocorrências visíveis, ordenava todas por data
  (com parte em disco) só para devolver as 2.000 mais recentes, e ainda ligava o JIT por causa da
  estimativa errada: ~330 ms por consulta sozinha, 1,2 s de p95 sob carga.
- **Índice parcial `(criada_em DESC, id DESC)` só com os status visíveis ao público:** numa área
  grande, o banco percorre as ocorrências já na ordem e para nas primeiras 2.000 dentro da área.
  Serve também ao feed sem filtro de município.
- **Índice GiST em `local_publico::geometry`, e o filtro do mapa passou a ser só
  `local_publico::geometry && retângulo`:** para um ponto, o `&&` já é a conferência exata. O
  índice tem estatísticas, então o planejador escolhe sozinho: área pequena parte do GiST (e ordena
  poucos pontos), área grande parte do índice por data. A mesma consulta caiu de ~330 ms para 16 ms.

## Rodando contra staging

Staging tem um banco só (`fiscaliza`), que **não** pode receber os dados sintéticos, e o limite
por IP ligado. O roteiro sobe, na mesma VM, um banco `fiscaliza_carga` no mesmo Postgres e uma
segunda API só para o teste, sem o limite, que não é exposta pelo Caddy. Na VM, em `/opt/fiscaliza`:

```bash
# 1. Banco sintético, gerado de dentro da imagem da API (a senha vem do .env de staging)
source .env
CARGA_URL="postgresql://fiscaliza:${POSTGRES_PASSWORD}@postgres:5432/fiscaliza_carga"
docker compose run --rm -e DATABASE_URL="$CARGA_URL" api node dist/cli/carga-sintetica.js gerar

# 2. Segunda API apontando para ele, sem o limite por IP, num banco próprio do Redis,
#    publicada só no localhost da VM
docker compose run -d --name fiscaliza-api-carga -p 127.0.0.1:3148:3000 \
  -e DATABASE_URL="$CARGA_URL" -e REDIS_URL=redis://redis:6379/5 \
  -e LIMITE_TAXA_DESLIGADO=true -e LOG_LEVEL=warn api

# 3. k6 na própria VM (copie a pasta apps/api/carga/k6 para ~/k6)
docker run --rm --network host -v ~/k6:/scripts grafana/k6:1.3.0 run \
  -e BASE_URL=http://localhost:3148/api/v1 /scripts/mapa.js   # e feed.js, detalhe.js

# 4. Limpeza: a API de carga e o banco sintético
docker rm -f fiscaliza-api-carga
docker compose run --rm -e DATABASE_URL="$CARGA_URL" api node dist/cli/carga-sintetica.js apagar
```

Rodar o k6 na própria VM mede a API e o banco, sem a internet no meio, e divide a CPU da VM com a
API: é um número conservador. Para medir também o Caddy e o HTTPS, rode o k6 de fora contra uma
rota publicada da API de carga, nunca contra `api-staging`, que tem o limite por IP (e deve continuar
tendo).
