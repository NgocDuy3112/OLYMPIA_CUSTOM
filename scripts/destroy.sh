#!/bin/bash
set -e

source "$(dirname "$0")/.env.scripts"

# Stop and remove containers, networks for beta-olympia-custom
podman-compose -p ${PROJECT} \
  -f ${COMPOSE_FILE} \
  --env-file ${ENV_FILE} \
  down

# Remove any remaining containers with the beta-olympia-custom label
podman ps -a --filter "${LABEL}" --format "{{.ID}}" | xargs -r podman rm -f

# Remove only images built for beta-olympia-custom
podman images --filter "${LABEL}" --format "{{.ID}}" | xargs -r podman rmi -f 2>/dev/null || true
# Prune any remaining dangling/built images for this project (fallback)
podman image prune --all --external --filter "${LABEL}" -f 2>/dev/null || true

# Remove only volumes belonging to beta-olympia-custom
podman volume ls --filter "${LABEL}" --format "{{.Name}}" | xargs -r podman volume rm
