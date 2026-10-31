#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# backup.sh — dump the Olympia PostgreSQL database straight to S3.
#
# SELF-CONTAINED BY DESIGN: every other script in this directory sources a
# `scripts/.env.scripts` file that does not exist in this repo, so they fail on
# line 4. This script therefore reads configuration from `configs/.env` (or the
# environment) and defines its own defaults. It does NOT source .env.scripts.
#
# By DEFAULT the dump is STREAMED to S3 as a pipe:
#     pg_dump | gzip | aws s3 cp - s3://bucket/key
# so no database dump ever rests on local disk. Only `--no-upload` writes a
# local file (the only way to keep a copy when there is no bucket target).
#
# Usage:
#   ./scripts/backup.sh [--dry-run] [--no-upload] [--retention N] [--help]
#
#   --dry-run       Print what would happen; touch nothing, contact nothing.
#   --no-upload     Write a local dump instead of streaming to S3.
#   --retention N   Prune LOCAL dumps older than N days (default 14; 0 = keep all).
#                   Irrelevant to the streaming path, which leaves nothing behind.
#
# Environment overrides (all optional):
#   ENV_FILE        default ./configs/.env
#   PG_CONTAINER    default olympia-postgresql
#   BACKUP_DIR      default ./backups/postgres   (only used with --no-upload)
#   CONTAINER_RT    default: podman if present, else docker
#   S3_PREFIX       default backups/postgres
#
# Exit codes: 0 success · 1 failure · 2 bad usage · 3 missing prerequisite
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Locate repo root so the script works from any CWD ────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${ENV_FILE:-$ROOT_DIR/configs/.env}"
PG_CONTAINER="${PG_CONTAINER:-olympia-postgresql}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
S3_PREFIX="${S3_PREFIX:-backups/postgres}"
RETENTION_DAYS=14
DRY_RUN=0
DO_UPLOAD=1

# ── Logging ─────────────────────────────────────────────────────────────────
log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '[%s] WARN: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die()  { printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit "${2:-1}"; }

usage() {
    sed -n '3,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
}

# ── Arguments ───────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)    DRY_RUN=1 ;;
        --no-upload)  DO_UPLOAD=0 ;;
        --retention)  shift; RETENTION_DAYS="${1:-}"
                      [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "--retention needs a non-negative integer" 2 ;;
        -h|--help)    usage ;;
        *)            die "Unknown argument: $1 (try --help)" 2 ;;
    esac
    shift
done

# ── Load configs/.env ───────────────────────────────────────────────────────
# Parse `configs/.env` instead of sourcing it. Shell-sourcing executes the file,
# which breaks on values containing spaces (`EMAIL_FROM_NAME=Olympia Custom`
# runs `Custom` as a command) and would also execute any injected $(...) —
# a real risk for a file that lives in a repo. This reader only assigns
# KEY=VALUE pairs: no expansion, no command execution.
load_env() {
    local file="$1" line key val
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue          # blank
        [[ "$line" =~ ^[[:space:]]*# ]] && continue          # comment
        [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
        key="${BASH_REMATCH[1]}"
        val="${BASH_REMATCH[2]}"
        if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then
            val="${BASH_REMATCH[1]}"                            # strip matching quotes
        else
            val="${val%%[[:space:]]#*}"                         # drop trailing " # comment"
            val="${val%"${val##*[![:space:]]}"}"                # trim trailing whitespace
        fi
        # Never clobber a value already exported by the caller.
        if [ -z "${!key:-}" ]; then
            printf -v "$key" '%s' "$val"
            export "$key"
        fi
    done < "$file"
}

if [ -f "$ENV_FILE" ]; then
    log "Loading config from $ENV_FILE"
    load_env "$ENV_FILE"
else
    warn "Config file not found: $ENV_FILE — relying on exported environment only"
fi

: "${POSTGRES_DB_USER:?POSTGRES_DB_USER is required}"
: "${POSTGRES_DB_NAME:?POSTGRES_DB_NAME is required}"
: "${POSTGRES_DB_PASSWORD:?POSTGRES_DB_PASSWORD is required}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASENAME="${POSTGRES_DB_NAME}_${STAMP}.sql.gz"
TARGET="$BACKUP_DIR/$BASENAME"
S3_KEY="$S3_PREFIX/$BASENAME"

# ── Dry run — report the plan without contacting anything ───────────────────
if [ "$DRY_RUN" -eq 1 ]; then
    log "DRY RUN — database: $POSTGRES_DB_NAME (owner: $POSTGRES_DB_USER)"
    log "DRY RUN — container: $PG_CONTAINER via ${CONTAINER_RT:-podman|docker}"
    if [ "$DO_UPLOAD" -eq 1 ]; then
        log "DRY RUN — would stream: pg_dump | gzip | aws s3 cp - s3://${S3_BUCKET_NAME:-<unset>}/$S3_KEY"
        log "DRY RUN — no local file would be written"
    else
        log "DRY RUN — would write local dump -> $TARGET"
        log "DRY RUN — retention: ${RETENTION_DAYS}d"
    fi
    log "DRY RUN — nothing written, no containers contacted"
    exit 0
fi

# ── Prerequisite checks ─────────────────────────────────────────────────────
if [ -z "${CONTAINER_RT:-}" ]; then
    if command -v podman >/dev/null 2>&1; then
        CONTAINER_RT=podman
    elif command -v docker >/dev/null 2>&1; then
        CONTAINER_RT=docker
    else
        die "Neither podman nor docker found on PATH" 3
    fi
fi
log "Container runtime: $CONTAINER_RT"

if ! "$CONTAINER_RT" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    die "Container '$PG_CONTAINER' is not running — start the stack first" 3
fi

if [ "$DO_UPLOAD" -eq 1 ]; then
    command -v aws >/dev/null 2>&1 || die "aws CLI not found (use --no-upload to skip S3)" 3
    : "${S3_BUCKET_NAME:?S3_BUCKET_NAME is required for upload}"
    : "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required for upload}"
    : "${S3_SECRET_ACCESS_KEY:?S3_SECRET_ACCESS_KEY is required for upload}"

    # An empty endpoint means standard AWS S3; passing an empty --endpoint-url
    # makes the CLI fail, so only add the flag when it has a value.
    AWS_GLOBAL=(--only-show-errors)
    if [ -n "${S3_ENDPOINT_URL:-}" ]; then
        AWS_GLOBAL+=(--endpoint-url "$S3_ENDPOINT_URL")
    fi
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
    export AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}"
fi

# pg_dump command shared by both paths.
dump_db() {
    "$CONTAINER_RT" exec -e PGPASSWORD="$POSTGRES_DB_PASSWORD" "$PG_CONTAINER" \
        pg_dump --clean --if-exists --no-owner --no-privileges \
                -U "$POSTGRES_DB_USER" -d "$POSTGRES_DB_NAME"
}

log "Database: $POSTGRES_DB_NAME  Owner: $POSTGRES_DB_USER"

# ── Path A (default): stream to S3, leave nothing on disk ───────────────────
if [ "$DO_UPLOAD" -eq 1 ]; then
    log "Streaming dump -> s3://$S3_BUCKET_NAME/$S3_KEY  (no local copy)"

    # pipefail is on, so a failure in pg_dump, gzip or the upload fails the run.
    if ! dump_db | gzip -9 | aws "${AWS_GLOBAL[@]}" s3 cp - "s3://$S3_BUCKET_NAME/$S3_KEY"; then
        die "Streaming backup failed — nothing was retained locally"
    fi

    # Confirm the object actually landed and is non-empty.
    REMOTE_SIZE="$(aws "${AWS_GLOBAL[@]}" s3api head-object \
        --bucket "$S3_BUCKET_NAME" --key "$S3_KEY" \
        --query 'ContentLength' --output text 2>/dev/null || echo "")"

    if [ -z "$REMOTE_SIZE" ] || [ "$REMOTE_SIZE" = "None" ]; then
        die "Upload reported success but the object could not be found at s3://$S3_BUCKET_NAME/$S3_KEY"
    fi
    [ "$REMOTE_SIZE" -gt 0 ] || die "Uploaded object is empty ($REMOTE_SIZE bytes)"

    log "Backup verified in S3: $REMOTE_SIZE bytes"
    log "Backup finished successfully (streamed, no local copy)"
    exit 0
fi

# ── Path B (--no-upload): write and verify a local dump ─────────────────────
mkdir -p "$BACKUP_DIR"
PARTIAL="$TARGET.partial"
cleanup() { rm -f "$PARTIAL"; }
trap cleanup EXIT

log "Writing local dump -> $TARGET"
if ! dump_db | gzip -9 > "$PARTIAL"; then
    die "pg_dump failed (see output above)"
fi

# Validate before trusting the file, then promote it atomically.
[ -s "$PARTIAL" ] || die "Dump is empty — aborting"
gzip -t "$PARTIAL" 2>/dev/null || die "Dump failed gzip integrity check — aborting"
mv "$PARTIAL" "$TARGET"

SIZE="$(du -h "$TARGET" | cut -f1)"
CHECKSUM="$(sha256sum "$TARGET" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$TARGET" | cut -d' ' -f1)"
printf '%s  %s\n' "$CHECKSUM" "$BASENAME" > "$TARGET.sha256"
log "Local dump complete: $SIZE  sha256=$CHECKSUM"

if [ "$RETENTION_DAYS" -gt 0 ]; then
    log "Pruning local dumps older than ${RETENTION_DAYS}d in $BACKUP_DIR"
    find "$BACKUP_DIR" -maxdepth 1 -type f \
         \( -name '*.sql.gz' -o -name '*.sql.gz.sha256' \) \
         -mtime "+$RETENTION_DAYS" -print -delete || warn "Prune encountered an error"
else
    log "Retention disabled (0) — keeping all local dumps"
fi

log "Backup finished successfully (local only)"
