import { defineConfig } from "drizzle-kit";
import { buildDatabaseUrl } from "./src/config/database-url.ts";

try {
    process.loadEnvFile("../configs/.env");
} catch {
    // No local env file; POSTGRES_* may be set in the shell.
}

export default defineConfig({
    schema: "./src/db/schema",
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: buildDatabaseUrl(),
    },
});