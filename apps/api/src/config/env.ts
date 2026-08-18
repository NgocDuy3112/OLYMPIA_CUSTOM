import { z } from "zod";

const envSchema = z.object({
  // ── Server ──
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // ── Database ──
  DATABASE_URL: z.string().url(),

  // ── Valkey ──
  VALKEY_HOST: z.string().default("localhost"),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
  VALKEY_USER: z.string().default("default"),

  // ── Auth ──
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // ── S3 ──
  S3_ENDPOINT_URL: z.string().optional(),
  S3_REGION: z.string().default("vn-hcm-1"),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PRESIGNED_URL_EXPIRY: z.coerce.number().default(3600),

  // ── CORS ──
  CORS_ORIGINS: z.string().default("*"),

  // ── Season ──
  SEASON: z.coerce.number().default(3),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

// Derived constants
export function getMatchPattern(season: number): string {
  return `OC${season}_M`;
}

export function getQuestionPattern(season: number): string {
  return `OC${season}_Q`;
}
