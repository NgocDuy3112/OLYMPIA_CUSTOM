/**
 * Application-level locks stored in Valkey.
 *
 * Buzzer lock: ensures only one player wins a buzzer race per question.
 * Power lock: prevents duplicate power activation per player.
 */

import type Redis from "ioredis";
import { randomUUID } from "node:crypto";

// ── Buzzer lock ──

const BUZZER_LOCK_PREFIX = "buzzer_lock:";
const BUZZER_WINDOW_PREFIX = "buzzer_window:";
const BUZZER_LOCK_TTL = 10; // seconds

export async function tryAcquireBuzzerLock(
  valkey: Redis,
  matchCode: string,
  questionCode: string,
): Promise<string | null> {
  const key = `${BUZZER_LOCK_PREFIX}${matchCode}:${questionCode}`;
  const token = randomUUID();
  const acquired = await valkey.set(key, token, "EX", BUZZER_LOCK_TTL, "NX");
  return acquired ? token : null;
}

const RELEASE_BUZZER_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseBuzzerLock(
  valkey: Redis,
  matchCode: string,
  questionCode: string,
  token: string,
): Promise<boolean> {
  const key = `${BUZZER_LOCK_PREFIX}${matchCode}:${questionCode}`;
  const result = await valkey.eval(RELEASE_BUZZER_SCRIPT, 1, key, token);
  return Number(result) === 1;
}

export async function activateBuzzerWindow(valkey: Redis, matchCode: string, questionCode: string, durationSeconds = 5): Promise<void> {
  await valkey.set(`${BUZZER_WINDOW_PREFIX}${matchCode}:${questionCode}`, "1", "EX", durationSeconds);
}

export async function isBuzzerWindowActive(valkey: Redis, matchCode: string, questionCode: string): Promise<boolean> {
  return (await valkey.exists(`${BUZZER_WINDOW_PREFIX}${matchCode}:${questionCode}`)) === 1;
}

export async function clearBuzzerState(valkey: Redis, matchCode: string, questionCode?: string): Promise<void> {
  const keys = [`${BUZZER_WINNER_PREFIX}${matchCode}`];
  if (questionCode) keys.push(`${BUZZER_LOCK_PREFIX}${matchCode}:${questionCode}`, `${BUZZER_WINDOW_PREFIX}${matchCode}:${questionCode}`);
  await valkey.del(...keys);
}

// ── Buzzer winners ──

const BUZZER_WINNER_PREFIX = "buzzer_winner:";
const BUZZER_WINNER_TTL = 30;

export async function getBuzzerWinners(
  valkey: Redis,
  matchCode: string,
): Promise<Record<string, string>> {
  const key = `${BUZZER_WINNER_PREFIX}${matchCode}`;
  return valkey.hgetall(key);
}

export async function setBuzzerWinner(
  valkey: Redis,
  matchCode: string,
  questionCode: string,
  userCode: string,
): Promise<Record<string, string>> {
  const key = `${BUZZER_WINNER_PREFIX}${matchCode}`;
  await valkey.hsetnx(key, questionCode, userCode);
  await valkey.expire(key, BUZZER_WINNER_TTL);
  return getBuzzerWinners(valkey, matchCode);
}

export async function clearBuzzerWinners(
  valkey: Redis,
  matchCode: string,
): Promise<void> {
  await valkey.del(`${BUZZER_WINNER_PREFIX}${matchCode}`);
}

// ── Power lock ──

const POWER_LOCK_PREFIX = "vd:power_lock:";
const POWER_LOCK_TTL = 5;

export async function tryAcquirePowerLock(
  valkey: Redis,
  matchCode: string,
  userCode: string,
): Promise<string | null> {
  const key = `${POWER_LOCK_PREFIX}${matchCode}:${userCode}`;
  const token = randomUUID();
  const acquired = await valkey.set(key, token, "EX", POWER_LOCK_TTL, "NX");
  return acquired ? token : null;
}

export async function releasePowerLock(
  valkey: Redis,
  matchCode: string,
  userCode: string,
  token: string,
): Promise<boolean> {
  const key = `${POWER_LOCK_PREFIX}${matchCode}:${userCode}`;
  const result = await valkey.eval(RELEASE_BUZZER_SCRIPT, 1, key, token);
  return Number(result) === 1;
}
