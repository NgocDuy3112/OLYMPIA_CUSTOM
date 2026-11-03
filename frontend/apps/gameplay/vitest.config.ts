import path from "node:path"
import { fileURLToPath } from "node:url"
import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"
import viteConfig from "./vite.config"

const dir = fileURLToPath(new URL(".", import.meta.url))

// Pure unit tests for the adapters and libs — no DOM needed, so node not jsdom.
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "node",
            // jsdom files opt in per-file (@vitest-environment jsdom); the setup
            // file is inert under node and gives them matchers + cleanup.
            setupFiles: [path.resolve(dir, "tests/setup.ts")],
            include: ["tests/**/*.test.{ts,tsx}"],
        },
    })
)
