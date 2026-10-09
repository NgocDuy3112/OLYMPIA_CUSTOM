import { defineConfig } from "drizzle-kit";

try {
    process.loadEnvFile("configs/.env");
} catch {
    // No local env file; DATABASE_URL may be set in the shell.
}

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL,
    },
});