FROM docker.io/library/node:24-alpine AS build
WORKDIR /app

# The whole frontend is the build context: apps/, shared/, public/, configs.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:audience

FROM docker.io/library/nginx:alpine
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/audience/dist /usr/share/nginx/html
EXPOSE 80
