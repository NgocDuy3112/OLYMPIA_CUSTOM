FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--import", "tsx", "src/server.ts"]