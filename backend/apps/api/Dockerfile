# ── Stage 1: build ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy package manifests (no source yet → better layer caching)
COPY apps/db/package.json              apps/db/package.json
COPY apps/api/package.json             apps/api/package.json

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source for @olympia/db and @olympia/api
COPY apps/db/src                       apps/db/src
COPY apps/db/tsconfig.json             apps/db/tsconfig.json
COPY apps/api/src                      apps/api/src
COPY apps/api/tsconfig.json            apps/api/tsconfig.json

# Build with turbo (respects dependency order)
RUN pnpm turbo build --filter=@olympia/api...

# ── Stage 2: production ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace root for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built @olympia/db
COPY --from=builder /app/apps/db/package.json apps/db/package.json
COPY --from=builder /app/apps/db/dist         apps/db/dist

# Copy built @olympia/api
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist         apps/api/dist

# Install production only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 8000

CMD ["node", "apps/api/dist/index.js"]
