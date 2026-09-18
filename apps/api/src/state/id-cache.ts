/**
 * ID resolution cache in Valkey.
 *
 * Maps human-readable codes (match_code, user_code, question_code)
 * to UUID primary keys. Avoids hitting the DB on every WS message.
 */

import type Redis from "ioredis";
import { drizzleMatchRepo } from "../modules/match/match.repo.js";
import { drizzleUserRepo } from "../modules/user/user.repo.js";
import { drizzleQuestionRepo } from "../modules/question/question.repo.js";

const CACHE_TTL = 3600; // 1 hour

function matchKey(code: string) {
  return `id:match:${code}`;
}
function userKey(code: string) {
  return `id:user:${code}`;
}
function questionKey(code: string) {
  return `id:question:${code}`;
}

export async function resolveMatchId(
  valkey: Redis,
  matchCode: string,
): Promise<string | null> {
  const cached = await valkey.get(matchKey(matchCode));
  if (cached) return cached;

  const row = await drizzleMatchRepo.findByCode(matchCode);
  if (!row) return null;

  const id = row.id;
  await valkey.set(matchKey(matchCode), id, "EX", CACHE_TTL);
  return id;
}

export async function resolveUserId(
  valkey: Redis,
  userCode: string,
): Promise<string | null> {
  const cached = await valkey.get(userKey(userCode));
  if (cached) return cached;

  const row = await drizzleUserRepo.findByCode(userCode);
  if (!row) return null;

  const id = row.id;
  await valkey.set(userKey(userCode), id, "EX", CACHE_TTL);
  return id;
}

export async function resolveQuestionId(
  valkey: Redis,
  questionCode: string,
): Promise<string | null> {
  const cached = await valkey.get(questionKey(questionCode));
  if (cached) return cached;

  const row = await drizzleQuestionRepo.findByCodeGlobal(questionCode);
  if (!row) return null;

  const id = row.id;
  await valkey.set(questionKey(questionCode), id, "EX", CACHE_TTL);
  return id;
}

export async function resolveBuzzIds(
  valkey: Redis,
  matchCode: string,
  userCode: string,
  questionCode: string,
): Promise<{
  matchId: string | null;
  playerId: string | null;
  questionId: string | null;
}> {
  const [matchId, playerId, questionId] = await Promise.all([
    resolveMatchId(valkey, matchCode),
    resolveUserId(valkey, userCode),
    resolveQuestionId(valkey, questionCode),
  ]);
  return { matchId, playerId, questionId };
}
