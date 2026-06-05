#!/bin/bash
set -e

source "$(dirname "$0")/.env.scripts"

# Stop and remove all containers, networks, and volumes for olympia-custom
podman-compose -p ${PROJECT} \
  -f ${COMPOSE_FILE} \
  --env-file ${ENV_FILE} \
  down

# Remove any remaining containers with the olympia-custom label
podman ps -a --filter "${LABEL}" --format "{{.ID}}" | xargs -r podman rm -f

# Remove images built for olympia-custom services
podman image prune --all --external --filter "${LABEL}" -f 2>/dev/null || true

# Build and start all services
podman-compose -p ${PROJECT} \
  -f ${COMPOSE_FILE} \
  --env-file ${ENV_FILE} \
  up -d --build --no-cache
