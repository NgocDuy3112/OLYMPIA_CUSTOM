# ── Stage 1: build ──────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY tsconfig.base.json ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN cd apps/discord-bot && pnpm install --no-frozen-lockfile

COPY apps/discord-bot/tsconfig.json ./apps/discord-bot/
COPY apps/discord-bot/src ./apps/discord-bot/src
RUN cd apps/discord-bot && pnpm build

# ── Stage 2: production ─────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app/apps/discord-bot/package.json apps/discord-bot/package.json
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/pnpm-workspace.yaml pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml pnpm-lock.yaml
RUN cd apps/discord-bot && pnpm install --prod --no-frozen-lockfile
COPY --from=builder /app/apps/discord-bot/dist dist

CMD ["node", "dist/index.js"]
