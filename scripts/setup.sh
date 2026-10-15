#!/usr/bin/env bash
set -euo pipefail
source configs/.env
cd "$(dirname "$0")/.."

COMPOSE=(podman compose --env-file configs/.env)

echo "==> Starting stack"
"${COMPOSE[@]}" up -d --build

echo "==> Waiting for postgres"
until "${COMPOSE[@]}" exec -T postgres pg_isready -U ${POSTGRES_USER} >/dev/null 2>&1; do sleep 1; done

echo "==> Creating database ${POSTGRES_DB}"
exists=$("${COMPOSE[@]}" exec -T postgres psql -U ${POSTGRES_USER} -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'")
[ -n "$exists" ] || "${COMPOSE[@]}" exec -T postgres psql -U postgres -c "CREATE DATABASE \"${POSTGRES_DB}\""

echo "==> Waiting for backend (boot migration runs here)"
(cd backend && npm run db:migrate && npm run seed:admin)

echo "==> Healthcheck the backend"
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 1; done

echo "==> Done"
