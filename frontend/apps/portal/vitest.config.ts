import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const dir = fileURLToPath(new URL(".", import.meta.url))

export default defineConfig({
    root: dir,
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(dir, "src"),
            "@shared": path.resolve(dir, "../../shared"),
        },
    },
    test: {
        environment: "jsdom",
        setupFiles: [path.resolve(dir, "tests/setup.ts")],
        include: ["tests/**/*.test.{ts,tsx}"],
    },
})