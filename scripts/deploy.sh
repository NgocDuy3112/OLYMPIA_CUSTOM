#!/bin/bash
set -e

source "$(dirname "$0")/.env.scripts"

podman-compose -p ${PROJECT} \
  -f ${COMPOSE_FILE} \
  --env-file ${ENV_FILE} \
  up -d --build --no-cache
