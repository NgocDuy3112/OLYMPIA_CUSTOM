#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(podman compose --env-file configs/.env)

echo "==> Stopping stack"
"${COMPOSE[@]}" down

echo "==> Database data kept in data/postgresql"
echo "==> Done"
