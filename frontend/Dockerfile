## Multi-stage Dockerfile for building frontend (Vite + TypeScript) and serving via nginx

FROM node:20-alpine AS builder

WORKDIR /app

# Vite inlines VITE_* at BUILD time, so these must be build args — passing them
# as runtime `environment:` on the container has no effect on the built bundle.
ARG VITE_API_BASE_URL=""
ARG VITE_WS_BASE_URL=""
ARG VITE_APP_ENV="prod"
ARG VITE_LOG_LEVEL=""
ARG VITE_LOG_ENDPOINT=""

# Install minimal build deps on Alpine
RUN apk add --no-cache libc6-compat

# Copy package files and install dependencies
# The build context for this Dockerfile is the `frontend/` directory, so copy package.json from the context root
COPY package.json ./
RUN npm install --no-audit --no-fund --silent

# Copy source and build
COPY . ./

# Write only the NON-EMPTY values into `.env.production.local` (highest-priority
# Vite env file for production mode). Emitting an empty string would defeat the
# `?? "/api"` fallbacks in src/configs.ts and produce broken request paths.
RUN set -e; \
    : > .env.production.local; \
    for v in VITE_API_BASE_URL VITE_WS_BASE_URL VITE_APP_ENV VITE_LOG_LEVEL VITE_LOG_ENDPOINT; do \
      eval "val=\$$v"; \
      if [ -n "$val" ]; then echo "$v=$val" >> .env.production.local; fi; \
    done; \
    cat .env.production.local

RUN npm run build

FROM nginx:stable-alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config to serve SPA and proxy API/WebSocket requests to the backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
