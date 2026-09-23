#!/bin/bash
set -e

# Fresh DB install (single path — old DB is gone).
#
# Usage: ./scripts/rebuild.sh

cd "$(dirname "$0")/.."

# Tự dò mọi configs/.env* (trừ *.example), source hết để lấy DB_USER/DB_NAME,
# rồi truyền từng file vào compose qua --env-file. Thêm file mới không sửa script.
ENV_FILES=(configs/.env.*)
ENV_ARGS=()
for f in "${ENV_FILES[@]}"; do
  case "$f" in
    *.example) continue ;;
  esac
  if [ -f "$f" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$f"
    set +a
    ENV_ARGS+=(--env-file "$f")
  fi
done
DB_USER="${POSTGRES_DB_USER}"
DB_NAME="${POSTGRES_DB_NAME}"

podman compose \
  "${ENV_ARGS[@]}" \
  -f docker-compose-dev.yaml up -d --build --force-recreate

podman image prune -f

until podman exec oc-postgresql pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; do
  echo "Waiting for postgres..."
  sleep 2
done

# Fresh DB nên tracking rỗng — migrate.sh apply hết 001→003 có track.
DB_CONTAINER=oc-postgresql DB_USER="$DB_USER" DB_NAME="$DB_NAME" ./scripts/migrate.sh

echo "Migrations completed."
