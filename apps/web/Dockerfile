
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile

COPY packages/shared/src packages/shared/src
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
RUN pnpm --filter @oc/shared build

COPY apps/web apps/web
RUN pnpm --filter frontend build

FROM node:20-alpine

RUN npm install -g serve

COPY --from=builder /app/apps/web/dist /app/dist

EXPOSE 80

CMD ["serve", "-s", "/app/dist", "-l", "80"]
