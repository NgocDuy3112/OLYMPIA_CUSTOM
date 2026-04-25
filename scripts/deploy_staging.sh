#!/usr/bin/env bash
set -euo pipefail

# deploy_staging.sh
# Helper for building / bringing up the staging stack.
# Usage: ./scripts/deploy_staging.sh <command> [args]

PROJECT_FILE="docker-compose.staging.yaml"
ENV_FILE="./configs/.env"
PROJECT_NAME="olympia-custom-staging"

# Detect compose wrapper
if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(podman-compose -f "${PROJECT_FILE}" -p "${PROJECT_NAME}" --env-file "${ENV_FILE}")
elif docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose -f "${PROJECT_FILE}" -p "${PROJECT_NAME}" --env-file "${ENV_FILE}")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose -f "${PROJECT_FILE}" -p "${PROJECT_NAME}" --env-file "${ENV_FILE}")
else
  echo "Error: no compose tool found (podman-compose / docker compose / docker-compose)" >&2
  exit 1
fi

# Helper: remove dangling images to free disk after builds
_prune() {
  if command -v podman >/dev/null 2>&1; then
    podman image prune -f
  else
    docker image prune -f
  fi
}

usage() {
  cat <<'USAGE'
Usage: deploy_staging.sh <command> [args]

Commands:
  build                  Build all images (no-cache) then prune dangling layers
  up                     Build + bring up all services (detached) then prune
  up-frontend            Rebuild frontend only and start it
  restart <service>      Restart a compose service
  stop <service>         Stop and remove a service container
  logs [service]         Follow logs (all services if omitted)
  ps                     Show service status
  rmi <image>            Stop containers using image, remove containers, remove image
  prune                  Remove dangling images manually
  help
USAGE
}

if [ "$#" -lt 1 ]; then
  usage
  exit 1
fi

cmd="$1"; shift || true

case "$cmd" in
  build)
    "${COMPOSE_CMD[@]}" build --no-cache --pull
    echo "--- Pruning dangling images ---"
    _prune
    ;;

  up)
    "${COMPOSE_CMD[@]}" up -d --build
    echo "--- Pruning dangling images ---"
    _prune
    echo "--- Following logs (Ctrl+C to detach, containers keep running) ---"
    "${COMPOSE_CMD[@]}" logs -f
    ;;

  up-frontend)
    echo "Building frontend..."
    "${COMPOSE_CMD[@]}" build --no-cache frontend
    echo "--- Pruning dangling images ---"
    _prune
    echo "Starting frontend..."
    "${COMPOSE_CMD[@]}" up -d frontend
    ;;

  restart)
    svc="${1:-}"
    if [ -z "$svc" ]; then echo "Specify service to restart"; exit 1; fi
    "${COMPOSE_CMD[@]}" restart "$svc"
    ;;

  stop)
    svc="${1:-}"
    if [ -z "$svc" ]; then echo "Specify service to stop"; exit 1; fi
    "${COMPOSE_CMD[@]}" stop "$svc"
    "${COMPOSE_CMD[@]}" rm -f "$svc" || true
    ;;

  logs)
    svc="${1:-}"
    if [ -n "$svc" ]; then
      "${COMPOSE_CMD[@]}" logs -f "$svc"
    else
      "${COMPOSE_CMD[@]}" logs -f
    fi
    ;;

  ps)
    "${COMPOSE_CMD[@]}" ps
    ;;

  rmi)
    image="${1:-}"
    if [ -z "$image" ]; then echo "Specify image (e.g. localhost/olympia-custom-staging_sfx-bot)"; exit 1; fi
    echo "Stopping and removing containers using image: $image"
    if command -v podman >/dev/null 2>&1; then
      podman ps -a --filter ancestor="$image" --format '{{.ID}}' | xargs -r podman stop || true
      podman ps -a --filter ancestor="$image" --format '{{.ID}}' | xargs -r podman rm  || true
      podman rmi -f "$image"
    else
      docker ps -a --filter ancestor="$image" --format '{{.ID}}' | xargs -r docker stop || true
      docker ps -a --filter ancestor="$image" --format '{{.ID}}' | xargs -r docker rm  || true
      docker rmi -f "$image"
    fi
    ;;

  prune)
    echo "--- Pruning dangling images ---"
    _prune
    ;;

  help|-h|--help)
    usage
    ;;

  *)
    echo "Unknown command: $cmd" >&2
    usage
    exit 1
    ;;

esac
