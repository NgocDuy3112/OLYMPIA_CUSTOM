FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./

COPY packages/db/package.json              packages/db/package.json
COPY packages/engine/package.json          packages/engine/package.json
COPY packages/shared/package.json          packages/shared/package.json
COPY apps/api/package.json             apps/api/package.json
COPY apps/api/mcp/package.json         apps/api/mcp/package.json

RUN pnpm install --frozen-lockfile

COPY packages/db/src                       packages/db/src
COPY packages/db/tsconfig.json             packages/db/tsconfig.json
COPY packages/engine/src                   packages/engine/src
COPY packages/engine/tsconfig.json         packages/engine/tsconfig.json
COPY packages/shared/src                   packages/shared/src
COPY packages/shared/tsconfig.json         packages/shared/tsconfig.json
COPY apps/api/src                      apps/api/src
COPY apps/api/tsconfig.json            apps/api/tsconfig.json
COPY apps/api/mcp/src                  apps/api/mcp/src
COPY apps/api/mcp/tsconfig.json        apps/api/mcp/tsconfig.json

RUN pnpm turbo build --filter=@oc/api... --filter=@oc/api-mcp...

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

COPY --from=builder /app/packages/db/package.json packages/db/package.json
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/engine/package.json packages/engine/package.json
COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/packages/shared/package.json packages/shared/package.json
COPY --from=builder /app/packages/shared/dist packages/shared/dist

COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist         apps/api/dist

COPY --from=builder /app/apps/api/mcp/package.json apps/api/mcp/package.json
COPY --from=builder /app/apps/api/mcp/dist         apps/api/mcp/dist

RUN pnpm install --frozen-lockfile --prod

EXPOSE 8000 8300

CMD ["sh", "-c", "node apps/api/dist/index.js & node apps/api/mcp/dist/index.js -- --http & wait"]
