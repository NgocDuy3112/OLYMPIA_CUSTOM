import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Strict mode: fail if Drizzle detects drift between schema and DB
  strict: true,
  // Verbose logging during generate/migrate
  verbose: true,
})
