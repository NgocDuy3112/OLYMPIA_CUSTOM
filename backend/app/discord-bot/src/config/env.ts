import { z } from 'zod'

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  NOTIFICATION_CHANNEL_ID: z.string().min(1),
  MATCH_CODE: z.string().default('OC3_M_VL'),

  VALKEY_HOST: z.string().default('localhost'),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
  VALKEY_USER: z.string().default('default'),
})

export type Env = z.infer<typeof envSchema>

let _env: Env | null = null

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env)
  }
  return _env
}
