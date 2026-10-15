import { defineConfig } from "vitest/config";
import {
    TEST_DATABASE_NAME,
    assertTestDatabaseUrl,
    deriveTestDatabaseUrl
} from "./tests/helpers/test-db-url.ts";
import { buildDatabaseUrl } from "./src/config/database-url.ts";

try {
    process.loadEnvFile("../configs/.env");
} catch {
    // No local env file; variables may be set in the shell.
}

const devUrl = buildDatabaseUrl();
const testUrl = deriveTestDatabaseUrl(devUrl);

assertTestDatabaseUrl(testUrl);

// Point EVERY consumer at the test database — including src/config/env.ts,
// which builds its URL from POSTGRES_* instead of reading DATABASE_URL.
process.env.POSTGRES_DB = TEST_DATABASE_NAME;
process.env.DATABASE_URL = testUrl;

if (buildDatabaseUrl() !== testUrl) {
    throw new Error(
        "App database URL does not match the test database URL — refusing to run."
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
            DATABASE_URL: testUrl,
            POSTGRES_DB: TEST_DATABASE_NAME
        }
    }
});