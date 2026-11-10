import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const dir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
    root: dir,
    cacheDir: path.resolve(dir, "node_modules/.vite"),
    publicDir: path.resolve(dir, "../../public"),
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(dir, "src"),
            "@shared": path.resolve(dir, "../../shared"),
        },
    },
    server: {
        port: 5174,
        // The egress container reaches this page over the host gateway
        // (host.containers.internal:5174) — a localhost-only bind would hide it,
        // and Vite's allowedHosts guard would 403 the container's Host header.
        host: true,
        allowedHosts: ["host.containers.internal"],
        proxy: {
            "/spectate": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            "/public": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            // The record page mints its viewer token through the gameplay door
            // (POST /gameplay/matches/:id/rtc/viewer-token) — public + rate-limited.
            "/gameplay": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
        },
    },
})
