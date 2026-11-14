#!/usr/bin/env bash
# One dump, one upload: s3://<bucket>/backups/pg_dump_<VN stamp>.sql.gz
# The container clock is Asia/Ho_Chi_Minh and the stamp is day-first — the
# Vietnamese order the desk reads: pg_dump_14-11-2026_02-00-00.sql.gz
set -euo pipefail

: "${POSTGRES_HOST:?set POSTGRES_HOST}"
: "${POSTGRES_USER:?set POSTGRES_USER}"
: "${POSTGRES_DB:?set POSTGRES_DB}"
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}"
: "${S3_ENDPOINT:?set S3_ENDPOINT}"
: "${S3_BUCKET:?set S3_BUCKET}"
: "${S3_ACCESS_KEY_ID:?set S3_ACCESS_KEY_ID}"
: "${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY}"

export PGPASSWORD="$POSTGRES_PASSWORD"
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

stamp="$(date +%d-%m-%Y_%H-%M-%S)"
file="pg_dump_${stamp}.sql.gz"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "[$(date '+%d-%m-%Y %H:%M:%S %Z')] dumping ${POSTGRES_DB} from ${POSTGRES_HOST}…"
pg_dump \
    --host="$POSTGRES_HOST" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --no-owner \
    --no-privileges \
    | gzip -9 >"$tmp/$file"

size="$(du -h "$tmp/$file" | cut -f1)"
aws --endpoint-url "$S3_ENDPOINT" \
    s3 cp "$tmp/$file" "s3://${S3_BUCKET}/backups/${file}" \
    --only-show-errors

echo "[$(date '+%d-%m-%Y %H:%M:%S %Z')] ok → backups/${file} (${size})"
