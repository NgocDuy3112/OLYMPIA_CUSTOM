import Redis, { type RedisOptions } from "ioredis";
import { getEnv } from "./config/env.js";

export function createValkeyClient(options: RedisOptions = {}): Redis {
  const env = getEnv();
  return new Redis({
    host: env.VALKEY_HOST,
    port: env.VALKEY_PORT,
    password: env.VALKEY_PASSWORD || undefined,
    username: env.VALKEY_USER || undefined,
    ...options,
  });
}
