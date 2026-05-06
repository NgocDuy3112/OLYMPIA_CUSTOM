#!/bin/bash
set -e

podman-compose -p olympia-custom \
  -f docker-compose.prod.yaml \
  --env-file ./configs/.env \
  down -v

podman system prune --all -f

podman volume prune -f
