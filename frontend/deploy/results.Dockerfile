FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:results

FROM docker.io/library/caddy:2-alpine

COPY --from=build /app/apps/results/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
