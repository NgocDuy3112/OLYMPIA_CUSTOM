#!/bin/bash
set -e

podman-compose -p olympia-custom \
  -f docker-compose.prod.yaml \
  --env-file ./configs/.env \
  up -d --build --no-cache
