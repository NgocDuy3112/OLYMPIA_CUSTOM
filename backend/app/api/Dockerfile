# ── Stage 1: build ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Copy package manifests (no source yet → better layer caching)
COPY app/db/package.json              app/db/package.json
COPY app/api/package.json             app/api/package.json

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Copy source for @oc/db and @oc/api
COPY app/db/src                       app/db/src
COPY app/db/tsconfig.json             app/db/tsconfig.json
COPY app/api/src                      app/api/src
COPY app/api/tsconfig.json            app/api/tsconfig.json

# Build with turbo (respects dependency order)
RUN pnpm turbo build --filter=@oc/api...

# ── Stage 2: production ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy workspace root for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built @oc/db
COPY --from=builder /app/app/db/package.json app/db/package.json
COPY --from=builder /app/app/db/dist         app/db/dist

# Copy built @oc/api
COPY --from=builder /app/app/api/package.json app/api/package.json
COPY --from=builder /app/app/api/dist         app/api/dist

# Install production only
RUN pnpm install --frozen-lockfile --prod

EXPOSE 8000

CMD ["node", "app/api/dist/index.js"]
