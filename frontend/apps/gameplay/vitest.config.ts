import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"
import viteConfig from "./vite.config"

// Pure unit tests for the adapters and libs — no DOM needed, so node not jsdom.
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "node",
            include: ["tests/**/*.test.{ts,tsx}"],
        },
    })
)
