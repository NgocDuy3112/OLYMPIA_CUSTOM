# ── Stage 1: build ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY apps/discord-bot/package.json ./
RUN pnpm install --no-frozen-lockfile

COPY apps/discord-bot/tsconfig.json ./
COPY apps/discord-bot/src ./src
RUN pnpm build

# ── Stage 2: production ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
