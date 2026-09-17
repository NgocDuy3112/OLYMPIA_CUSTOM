#!/bin/bash
set -e

# Fresh DB install (single path — old DB is gone).
#
# Usage: ./scripts/rebuild.sh

cd "$(dirname "$0")/.."

if [ -f configs/.env ]; then
  set -a
  source configs/.env
  set +a
fi
DB_USER="${POSTGRES_DB_USER}"
DB_NAME="${POSTGRES_DB_NAME}"

podman compose -f docker-compose-dev.yaml up -d --build --force-recreate

podman image prune -f

until podman exec oc-postgresql pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  echo "Waiting for postgres..."
  sleep 2
done

for f in packages/db/migrations/*.sql; do
  echo "Applying migration $f..."
  podman exec -i oc-postgresql psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 < "$f"
done

echo "Migrations completed."
