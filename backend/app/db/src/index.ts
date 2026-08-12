import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Re-export everything so consumers can do:
//   import { db, users, matches } from '@oc/db'
//   `db` auto-connects on first use, or use getDb() for explicit init
export * from './schema'

// ── Connection ──

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}
const dbUrl: string = connectionString

let _client: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export async function getDb() {
  if (!_db) {
    _client = postgres(dbUrl, {
      max: 20,
      idle_timeout: 20,
      connect_timeout: 10,
    })
    _db = drizzle(_client, { schema })
  }
  return _db
}

export async function getClient() {
  if (!_client) await getDb()
  return _client!
}

export async function closeDb() {
  if (_client) {
    await _client.end()
    _client = null
    _db = null
  }
}

// Lazy proxy — `db` auto-connects on first use
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_, prop) {
    if (!_db) {
      _client = postgres(dbUrl, {
        max: 20,
        idle_timeout: 20,
        connect_timeout: 10,
      })
      _db = drizzle(_client, { schema })
    }
    return Reflect.get(_db, prop)
  },
})
