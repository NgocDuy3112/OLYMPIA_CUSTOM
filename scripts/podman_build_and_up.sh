#!/usr/bin/env bash
# Build and bring up backend, frontend and bots using podman-compose
set -euo pipefail

COMPOSE_FILE=${1:-docker-compose.yaml}
ENV_FILE=${2:-./configs/.env}
PROJECT=${3:-olympia-custom}
PROFILE=${4:-development}

echo "Building images (app, frontend, bgm-bot, sfx-bot) using podman-compose..."
podman-compose -f "$COMPOSE_FILE" -p "$PROJECT" --profile "$PROFILE" --env-file "$ENV_FILE" build app frontend bgm-bot sfx-bot

echo "Starting services: app, frontend, bgm-bot, sfx-bot..."
podman-compose -f "$COMPOSE_FILE" -p "$PROJECT" --profile "$PROFILE" --env-file "$ENV_FILE" up -d app frontend bgm-bot sfx-bot

echo "Done. Use 'podman logs -f <service>' to view logs (e.g., podman logs -f app)"
