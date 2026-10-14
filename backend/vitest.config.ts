import { defineConfig } from "vitest/config";

try {
    process.loadEnvFile("../configs/.env");
} catch {
    // No local env file; variables may be set in the shell.
}

const devUrl = process.env.DATABASE_URL;

if (!devUrl) {
    throw new Error("DATABASE_URL is not set — refusing to run tests.");
}

const testUrl = devUrl.replace(/\/[^/?]+$/, "/olympia_test");

if (!testUrl.includes("test") || testUrl === devUrl) {
    throw new Error(
        "Derived test URL is unsafe — refusing to destroy a non-test database."
    );
}

export default defineConfig({
    server: {
        proxy: {
            "/portal": "http://localhost:3000",
            "/gameplay": "http://localhost:3000",
        },
    },
    test: {
        include: ["tests/**/*.test.ts"],
        fileParallelism: false,
        globalSetup: ["./tests/setup/global.ts"],   // once per run: drop schema + migrate
        setupFiles: ["./tests/setup/file.ts"],      // per file: truncate tables
        env: {
            DATABASE_URL: testUrl
        }
    }
});