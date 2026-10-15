import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { deriveTestDatabaseUrl } from "../helpers/test-db-url.js";
import { buildDatabaseUrl } from "../../src/config/database-url.js";


const testUrl = deriveTestDatabaseUrl(buildDatabaseUrl());
const dbName = testUrl.split("/").pop()!.split("?")[0];
const adminUrl = testUrl.replace(/\/[^/?]+$/, "/postgres");


export default async function globalSetup(): Promise<void> {
    // 1. Create the test database if it does not exist yet.
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    try {
        const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
            dbName
        ]);
        if (rows.length === 0) {
            await admin.query(`CREATE DATABASE "${dbName}"`); // quoted: identifiers may carry odd chars
            console.log(`[global-setup] created database ${dbName}`);
        }
    } finally {
        await admin.end();
    }

    // 2. Fresh schema every run, 3. migrations applied.
    const pool = new pg.Pool({ connectionString: testUrl });
    try {
        await pool.query("DROP SCHEMA public CASCADE");
        await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
        await pool.query("CREATE SCHEMA public");
        await migrate(drizzle(pool), { migrationsFolder: "./migrations" }); // cwd = backend/
        console.log("[global-setup] schema reset + migrations applied");
    } finally {
        await pool.end();
    }
}
