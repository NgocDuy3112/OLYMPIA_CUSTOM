import { defineConfig } from "drizzle-kit";

const dbUrl =
  process.env.DATABASE_URL ??
  (() => {
    const u = new URL("postgresql://localhost:5432/db");
    u.username = process.env.POSTGRES_DB_USER ?? "olympia";
    u.password = process.env.POSTGRES_DB_PASSWORD ?? "";
    u.hostname = process.env.POSTGRES_DB_HOST ?? "localhost";
    u.port = process.env.POSTGRES_DB_PORT ?? "5432";
    u.pathname = `/${process.env.POSTGRES_DB_NAME ?? "olympia_custom"}`;
    return u.toString();
  })();

export default defineConfig({
  schema: "./src/schema/*",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
  },
  // Strict mode: fail if Drizzle detects drift between schema and DB
  strict: true,
  // Verbose logging during generate/migrate
  verbose: true,
});
