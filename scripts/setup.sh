#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f configs/.env ]; then
    echo "error: configs/.env is missing" >&2
    echo "hint:  cp configs.example/.env.example configs/.env  # then fill in the secrets" >&2
    exit 1
fi
source configs/.env

COMPOSE=(podman compose --env-file configs/.env)

if ! podman volume exists aoc-postgresql >/dev/null 2>&1; then
    echo "==> Creating volume aoc-postgresql"
    podman volume create aoc-postgresql >/dev/null
fi

echo "==> Starting stack"
"${COMPOSE[@]}" up -d --build --force-recreate

echo "==> Waiting for postgres"
until "${COMPOSE[@]}" exec -T postgres pg_isready -U "${POSTGRES_USER}" >/dev/null 2>&1; do sleep 1; done

echo "==> Creating database ${POSTGRES_DB}"
exists=$("${COMPOSE[@]}" exec -T postgres psql -U "${POSTGRES_USER}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'")
[ -n "$exists" ] || "${COMPOSE[@]}" exec -T postgres psql -U postgres -c "CREATE DATABASE \"${POSTGRES_DB}\""

echo "==> Waiting for backend (boot migrations run here)"
for _ in $(seq 1 120); do
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        break
    fi
    sleep 1
done
if ! curl -sf http://localhost:3000/health >/dev/null 2>&1; then
    echo "error: backend never became healthy — check: ${COMPOSE[*]} logs backend" >&2
    exit 1
fi

echo "==> Seeding the first admin (no-op if it already exists)"
"${COMPOSE[@]}" exec -T backend dotnet Olympia.Api.dll --seed-admin

echo "==> Done"
