#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f configs/.env ] && source configs/.env

CONTAINER_NAME="${POSTGRES_CONTAINER}"
DB_NAME="${POSTGRES_DB}"
DB_USER="${POSTGRES_USER}"


find_container() {
    local runtime names

    for runtime in podman docker; do
        command -v "$runtime" >/dev/null 2>&1 || continue

        if "$runtime" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
            printf '%s %s' "$runtime" "$CONTAINER_NAME"
            return 0
        fi

        names="$("$runtime" ps --format '{{.Names}} {{.Image}}' 2>/dev/null \
            | awk '$2 ~ /postgres/ { print $1; exit }')"
        if [ -n "$names" ]; then
            printf '%s %s' "$runtime" "$names"
            return 0
        fi
    done

    return 1
}

if ! FOUND="$(find_container)"; then
    echo "error: no running PostgreSQL container found (podman or docker)" >&2
    echo "hint:  start the stack with ./scripts/setup.sh" >&2
    exit 1
fi

read -r RUNTIME CONTAINER <<< "$FOUND"
echo "==> ${RUNTIME}://${CONTAINER} → ${DB_NAME} (user ${DB_USER})" >&2

if [ "$#" -eq 0 ]; then
    exec "$RUNTIME" exec -it "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
fi

if [ "${1:0:1}" = "-" ]; then
    exec "$RUNTIME" exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" "$@"
fi

exec "$RUNTIME" exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$*"
