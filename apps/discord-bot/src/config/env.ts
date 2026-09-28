import { z } from "zod";

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1),
  NOTIFICATION_CHANNEL_ID: z.string().min(1),
  MATCH_CODE: z.string().default("OC3_M_VL"),
  DISCORD_GUILD_ID: z.string().min(1),
  DISCORD_PLAYER_MAP: z.string().default("{}"),

  VALKEY_HOST: z.string().default("localhost"),
  VALKEY_PORT: z.coerce.number().default(6379),
  VALKEY_PASSWORD: z.string().optional(),
  VALKEY_USER: z.string().default("default"),

  API_BASE_URL: z.string().default("http://localhost:8000/api"),
  // Staff account cho bot (operator + controller) — session thay token riêng.
  BOT_STAFF_USERNAME: z.string().default(""),
  BOT_STAFF_PASSWORD: z.string().default(""),

  // ── MCP discord (stdio + HTTP) ──
  MCP_ALLOWED_CHANNELS: z.string().default(""),
  VERIFY_TTL_SEC: z.coerce.number().default(3600),
  VERIFY_REMIND_SEC: z.coerce.number().default(900),
  VERIFY_MAX_REMIND: z.coerce.number().default(3),
  VERIFY_ROLE_IDS: z.string().default(""),
  MCP_HTTP_PORT: z.coerce.number().default(8301),
  MCP_HTTP_HOST: z.string().default("0.0.0.0"),
  // Bearer tokens cho POST /mcp ("tok1;tok2"). Rỗng = dev mở.
  MCP_HTTP_TOKENS: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}
