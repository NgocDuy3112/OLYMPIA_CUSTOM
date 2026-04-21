## Multi-stage Dockerfile for building frontend (Vite + TypeScript) and serving via nginx

FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps
RUN apk add --no-cache libc6-compat

# Copy package files and install dependencies
# The build context for this Dockerfile is the `frontend/` directory, so copy package.json from the context root
COPY package.json ./
RUN npm install --no-audit --no-fund --silent

# Copy source and build
COPY . ./
RUN npm run build

FROM nginx:stable-alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config to serve SPA and proxy API/WebSocket requests to the backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
