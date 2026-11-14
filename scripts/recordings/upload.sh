#!/usr/bin/env bash
set -euo pipefail

SRC="${1:-./recordings}"

: "${S3_ENDPOINT:?set S3_ENDPOINT in configs/.env}"
: "${S3_BUCKET:?set S3_BUCKET in configs/.env}"
: "${S3_ACCESS_KEY_ID:?set S3_ACCESS_KEY_ID in configs/.env}"
: "${S3_SECRET_ACCESS_KEY:?set S3_SECRET_ACCESS_KEY in configs/.env}"

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"

if [ ! -d "$SRC" ]; then
    echo "no such directory: $SRC" >&2
    exit 1
fi

extra=()
if [ "${DRY_RUN:-}" = "1" ]; then
    extra+=(--dryrun)
fi

aws --endpoint-url "$S3_ENDPOINT" \
    s3 cp "$SRC/" "s3://${S3_BUCKET}/recordings/" \
    --recursive \
    --exclude "*" \
    --include "*.mp4" --include "*.mkv" --include "*.mov" --include "*.webm" \
    ${extra[@]+"${extra[@]}"}

echo "done → s3://${S3_BUCKET}/recordings/  (public read: the links play)"
