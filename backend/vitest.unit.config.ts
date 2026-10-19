import { defineConfig } from "vitest/config";

// Pure unit tests: no database, no global setup. Run with `npm run test:unit`.
export default defineConfig({
    test: {
        include: ["tests/unit/**/*.test.ts"],
    }
});
