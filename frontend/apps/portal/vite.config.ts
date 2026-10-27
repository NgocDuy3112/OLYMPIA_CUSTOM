import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const dir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
    root: dir,
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
            // /gameplay + ws: the portal's PLAYER shell (PIN join → player view)
            // rides the player surface — same endpoints the gameplay app uses,
            // including the live stream's socket upgrade.
            "/portal": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false },
            "/gameplay": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", changeOrigin: false, ws: true },
        },
    },
})