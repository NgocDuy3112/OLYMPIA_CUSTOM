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
        port: 5176,
        // Venue screens open this page from other devices on the LAN — a
        // localhost-only bind would hide it, and Vite's allowedHosts guard
        // would 403 those Host headers.
        host: true,
        allowedHosts: ["host.containers.internal"],
        proxy: {
            "/spectate": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            "/public": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
        },
    },
})
