import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
});

export const db = drizzle(pool);

export async function closePool(): Promise<void> {
    await pool.end();
}