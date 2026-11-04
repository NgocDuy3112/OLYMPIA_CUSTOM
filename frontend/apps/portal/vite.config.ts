import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const dir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
    root: dir,
    // Per-app optimizer cache: the portal and gameplay dev servers must never
    // fight over one .vite dir (concurrent dev = stale-hash 504 loops).
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
            // Same escape hatch as the gameplay app: another process (e.g. podman's
            // gvproxy) can hold port 3000, so the dev backend may live elsewhere.
            // /gameplay + ws: the portal's PLAYER shell (the player's own deck lives there)
            // rides the player surface — same endpoints the gameplay app uses,
            // including the live stream's socket upgrade.
            // ws: true on every surface — the live stream's socket upgrade rides
            // these proxies (the console channel and the player channel alike).
            "/portal": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            "/gameplay": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
            // The link-only spectator twins (public reads — same backend).
            "/spectate": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
        },
    },
})