# The AUDIENCE host: until apps/audience exists this serves the portal bundle, whose only public route is /spectate/:tournament/:match. It is proxied NOTHING from /portal or /gameplay, so the admin API is unreachable from this host.
#
# Build from the FRONTEND ROOT (the shared kit lives outside apps/):
#   podman build -f deploy/audience.Dockerfile -t oc-audience ..

FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

# The whole frontend is the build context: apps/, shared/, public/, configs.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:portal

FROM docker.io/library/nginx:alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/audience/dist /usr/share/nginx/html
EXPOSE 80
