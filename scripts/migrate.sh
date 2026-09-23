#!/bin/bash
# Chạy migrations SQL theo thứ tự, track file đã applied.
# Dùng: ./scripts/migrate.sh [status]
set -euo pipefail

# Optional local overrides (copy configs/.env.scripts.example).
if [ -f "$(dirname "$0")/../configs/.env.scripts" ]; then
  # shellcheck disable=SC1090
  source "$(dirname "$0")/../configs/.env.scripts"
fi

CONTAINER="${DB_CONTAINER:-oc-postgresql}"
DB_USER="${DB_USER:-olympia}"
DB_NAME="${DB_NAME:-olympia_custom}"
MIGRATIONS_DIR="$(dirname "$0")/../migrations"

psql_exec() {
  podman exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

psql_exec -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());" > /dev/null

if [ "${1:-up}" = "status" ]; then
  echo "Applied:"
  psql_exec -tAc "SELECT filename FROM schema_migrations ORDER BY 1;"
  echo "Pending:"
  comm -23 <(ls "$MIGRATIONS_DIR"/*.sql | xargs -n1 basename | sort) \
           <(psql_exec -tAc "SELECT filename FROM schema_migrations ORDER BY 1;" | sort)
  exit 0
fi

# baseline: DB đã migrate tay trước đây — ghi nhận hết, không chạy lại.
if [ "${1:-up}" = "baseline" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    name=$(basename "$f")
    psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING;" > /dev/null
    echo "BASELINE $name"
  done
  exit 0
fi

applied=0
for f in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$f")
  done=$(psql_exec -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name';")
  if [ "$done" = "1" ]; then
    echo "SKIP $name"
    continue
  fi
  echo "APPLY $name"
  psql_exec < "$f" > /dev/null
  psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('$name');" > /dev/null
  applied=$((applied + 1))
done

echo "Done: $applied applied."
