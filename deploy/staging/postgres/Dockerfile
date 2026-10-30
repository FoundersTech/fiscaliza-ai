# PostgreSQL 16 com PostGIS 3 para ARM (Oracle A1).
# A imagem postgis/postgis, usada no desenvolvimento e no CI, só existe para amd64. Esta parte da
# imagem oficial do postgres, que é multiarquitetura, e instala o PostGIS pelo repositório do
# PostgreSQL que ela já traz configurado. É montada na própria VM pelo docker compose.
FROM postgres:16-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
  && rm -rf /var/lib/apt/lists/*
