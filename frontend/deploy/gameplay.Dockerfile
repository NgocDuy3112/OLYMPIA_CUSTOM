FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:gameplay

FROM docker.io/library/nginx:alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/gameplay/dist /usr/share/nginx/html
EXPOSE 80
