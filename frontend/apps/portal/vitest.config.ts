import path from "node:path"
import { fileURLToPath } from "node:url"
import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"
import viteConfig from "./vite.config"

const dir = fileURLToPath(new URL(".", import.meta.url))

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "jsdom",
            setupFiles: [path.resolve(dir, "tests/setup.ts")],
            include: ["tests/**/*.test.{ts,tsx}"],
        },
    })
)