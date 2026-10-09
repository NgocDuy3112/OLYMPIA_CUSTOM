import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 10,
});

pool.on("error", (error) => {
    console.error("Unexpected error on idle PostgreSQL client:", error);
});

export const db = drizzle(pool);

export async function closePool(): Promise<void> {
    await pool.end();
}