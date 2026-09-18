import { z } from "zod";

const envSchema = z.object({
  // ── Server ──
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z.string().default("info"),
  AGENT_URL: z.string().default("http://localhost:8100"),
  BOT_EXECUTOR_URL: z.string().default("http://localhost:8200"),
  // Shared secret for discord-bot -> API score-review callbacks.
  // If empty (dev), bot callbacks are allowed without token (same as ai-agent).
  BOT_SERVICE_TOKEN: z.string().default(""),

  // ── Database ──
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_DB_USER: z.string().optional(),
  POSTGRES_DB_PASSWORD: z.string().optional(),
  POSTGRES_DB_HOST: z.string().optional(),
  POSTGRES_DB_PORT: z.coerce.number().optional(),
  POSTGRES_DB_NAME: z.string().optional(),

  // ── Valkey ──
  VALKEY_HOST: z.string().default("localhost"),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
  VALKEY_USER: z.string().default("default"),

  // ── Auth ──
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // ── Seeded staff accounts (admin/operator login via username+password) ──
  // Format: "username:argon2id_hash:role:scopes" separated by ";".
  // Example: "admin:$argon2id$...:admin:;mc1:$argon2id$...:operator:mc"
  STAFF_CREDENTIALS: z.string().default(""),

  // ── S3 ──
  S3_ENDPOINT_URL: z.string().optional(),
  S3_REGION: z.string().default("vn-hcm-1"),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PRESIGNED_URL_EXPIRY: z.coerce.number().default(3600),

  // ── CORS ──
  CORS_ORIGINS: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}
