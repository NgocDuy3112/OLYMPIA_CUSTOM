#!/bin/bash
set -e

source "$(dirname "$0")/.env.scripts"


BACKUP_DIR="${BACKUP_DIR:-/opt/olympia/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
CONTAINER="${DB_CONTAINER:-olympia-postgresql}"
DB_USER="${DB_USER:-olympia}"
DB_NAME="${DB_NAME:-olympia_custom}"

mkdir -p "$BACKUP_DIR"

STAMP=$(date +%F_%H%M%S)
OUT="$BACKUP_DIR/backup_$STAMP.sql"

podman exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$OUT"

# Compress to save space
gzip -f "$OUT"
GZ="$OUT.gz"

if [ -n "$BACKUP_S3_BUCKET" ] && [ -n "$BACKUP_S3_ACCESS_KEY_ID" ]; then
  export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${S3_REGION}"
  AWS_ARGS=()
  [ -n "$S3_ENDPOINT_URL" ] && AWS_ARGS+=(--endpoint-url "$S3_ENDPOINT_URL")
  aws "${AWS_ARGS[@]}" s3 cp "$GZ" "s3://$BACKUP_S3_BUCKET/backups/$(basename "$GZ")" \
    --storage-class STANDARD_IA
  echo "Uploaded to s3://$BACKUP_S3_BUCKET/backups/$(basename "$GZ")"
fi

find "$BACKUP_DIR" -name 'backup_*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup done: $GZ"
