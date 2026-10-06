FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY apps/api/package.json apps/api/package.json
COPY apps/api/mcp/package.json apps/api/mcp/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api/src apps/api/src
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/mcp/src apps/api/mcp/src
COPY apps/api/mcp/tsconfig.json apps/api/mcp/tsconfig.json

RUN pnpm turbo build --filter=@oc/api... --filter=@oc/api-mcp...

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./


COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist apps/api/dist

COPY --from=builder /app/apps/api/mcp/package.json apps/api/mcp/package.json
COPY --from=builder /app/apps/api/mcp/dist apps/api/mcp/dist

RUN pnpm install --frozen-lockfile --prod

EXPOSE 8000 8300

CMD ["sh", "-c", "node apps/api/dist/index.js & node apps/api/mcp/dist/index.js -- --http & wait"]
