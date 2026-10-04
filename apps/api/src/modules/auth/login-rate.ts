import { AppError } from "../../utils/errors.js";
import type Redis from "ioredis";

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_BLOCK_SEC = 15 * 60;

function loginAttemptKey(id: string): string {
  return `login:attempts:${id}`;
}

function loginBlockKey(id: string): string {
  return `login:block:${id}`;
}

export async function checkLoginRateLimit(
  valkey: Redis,
  id: string,
): Promise<void> {
  if (!valkey) return;
  const blocked = await valkey.get(loginBlockKey(id));
  if (blocked) {
    throw new AppError(429, "Too many login attempts, try again later");
  }
}

export async function recordFailedLogin(
  valkey: Redis,
  id: string,
): Promise<void> {
  if (!valkey) return;
  const key = loginAttemptKey(id);
  const count = await valkey.incr(key);
  if (count === 1) await valkey.expire(key, LOGIN_WINDOW_SEC);
  if (count >= LOGIN_MAX_ATTEMPTS) {
    await valkey.set(loginBlockKey(id), "1", "EX", LOGIN_BLOCK_SEC);
    await valkey.del(key);
  }
}

export async function clearFailedLogins(
  valkey: Redis,
  id: string,
): Promise<void> {
  if (!valkey) return;
  await valkey.del(loginAttemptKey(id));
}
