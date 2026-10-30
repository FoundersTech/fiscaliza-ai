#!/usr/bin/env bash
# Sobe na VM a versão indicada no .env. O workflow de deploy chama este script por SSH e manda o
# token do GHCR pela entrada padrão: ./subir.sh <usuario-do-github> <<< "$TOKEN"
set -euo pipefail
cd "$(dirname "$0")"

chmod 600 .env
docker login ghcr.io -u "$1" --password-stdin
docker compose pull api caddy redis
docker logout ghcr.io

docker compose build postgres
docker compose up -d --wait postgres redis
# Migrations e carga inicial antes de a API nova subir; se falharem, a anterior continua no ar.
# O -T e o </dev/null impedem o container de ler a entrada padrão do SSH.
docker compose run --rm -T migracao </dev/null
docker compose up -d --wait --remove-orphans api caddy </dev/null
docker image prune -f
