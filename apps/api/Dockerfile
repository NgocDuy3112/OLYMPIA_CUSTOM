# ── Stage 1: build ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy package manifests (no source yet → better layer caching)
COPY packages/db/package.json              packages/db/package.json
COPY packages/engine/package.json          packages/engine/package.json
COPY packages/shared/package.json          packages/shared/package.json
COPY apps/api/package.json             apps/api/package.json

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source for @oc/db, @oc/engine, @oc/shared and @oc/api
COPY packages/db/src                       packages/db/src
COPY packages/db/tsconfig.json             packages/db/tsconfig.json
COPY packages/engine/src                   packages/engine/src
COPY packages/engine/tsconfig.json         packages/engine/tsconfig.json
COPY packages/shared/src                   packages/shared/src
COPY packages/shared/tsconfig.json         packages/shared/tsconfig.json
COPY apps/api/src                      apps/api/src
COPY apps/api/tsconfig.json            apps/api/tsconfig.json

# Build with turbo (respects dependency order)
RUN pnpm turbo build --filter=@oc/api...

# ── Stage 2: production ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace root for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built @oc/db, @oc/engine, @oc/shared
COPY --from=builder /app/packages/db/package.json packages/db/package.json
COPY --from=builder /app/packages/db/dist         packages/db/dist
COPY --from=builder /app/packages/engine/package.json packages/engine/package.json
COPY --from=builder /app/packages/engine/dist         packages/engine/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/shared/dist         packages/shared/dist

# Copy built @oc/api
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist         apps/api/dist

# Install production only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 8000

CMD ["node", "apps/api/dist/index.js"]
