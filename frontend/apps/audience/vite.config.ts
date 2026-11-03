import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const dir = fileURLToPath(new URL(".", import.meta.url))

// The AUDIENCE host: public, link-only, no session of any kind. It reads ONLY the
// public twins — /spectate/* (the live projection, answers stripped, no ledger)
// and /public/* (tournament pages) — so its API family is deliberately two
// prefixes, and neither the admin nor the player API is reachable from it.
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
        proxy: {
            "/spectate": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            "/public": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
        },
    },
})
