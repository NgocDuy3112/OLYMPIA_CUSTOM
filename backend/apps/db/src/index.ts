import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Re-export everything so consumers can do:
//   import { db, users, matches } from '@olympia/db'
export * from './schema'

// ── Connection ──

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

// postgres.js client — used by both Drizzle and raw SQL
export const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
})

// Drizzle ORM instance — type-safe queries
export const db = drizzle(client, { schema })
