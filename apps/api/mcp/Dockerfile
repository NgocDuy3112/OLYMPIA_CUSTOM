FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY apps/api/mcp/package.json ./apps/api/mcp/
COPY tsconfig.base.json ./
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN cd apps/api/mcp && pnpm install --no-frozen-lockfile

COPY apps/api/mcp/tsconfig.json ./apps/api/mcp/
COPY apps/api/mcp/src ./apps/api/mcp/src
RUN cd apps/api/mcp && pnpm build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_PORT=8300

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=builder /app/apps/api/mcp/package.json apps/api/mcp/package.json
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/pnpm-workspace.yaml pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml pnpm-lock.yaml
RUN cd apps/api/mcp && pnpm install --prod --no-frozen-lockfile
COPY --from=builder /app/apps/api/mcp/dist apps/api/mcp/dist

EXPOSE 8300

CMD ["node", "apps/api/mcp/dist/index.js", "--http"]
