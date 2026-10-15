import pg from "pg";
import { assertTestDatabaseUrl } from "../helpers/test-db-url.js";

// This file truncates every table — never let it point at a non-test database.
assertTestDatabaseUrl(process.env.DATABASE_URL!);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });

const { rows } = await pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
);

if (rows.length > 0) {
    const list = rows.map((r) => `"${r.tablename}"`).join(", ");
    await pool.query(`TRUNCATE ${list} CASCADE`);
    console.log(`[file-setup] truncated ${rows.length} tables`);
}

await pool.end();
