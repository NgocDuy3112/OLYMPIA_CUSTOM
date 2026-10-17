import { defineConfig } from "vitest/config"

export default defineConfig({
    test: {
        projects: [
            "apps/portal/vitest.config.ts",
            // "apps/gameplay/vitest.config.ts",
            // "shared/vitest.config.ts",
        ],
    },
})