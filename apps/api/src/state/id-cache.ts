/**
 * ID resolution cache in Valkey.
 *
 * Maps human-readable codes (match_code, user_code, question_code)
 * to UUID primary keys. Avoids hitting the DB on every WS message.
 */

import type Redis from "ioredis";
import { eq, and } from "drizzle-orm";
import { db, users, matches, questions } from "@oc/db";

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

  const row = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.matchCode, matchCode), eq(matches.isDeleted, false)))
    .limit(1);

  if (row.length === 0) return null;

  const id = row[0].id;
  await valkey.set(matchKey(matchCode), id, "EX", CACHE_TTL);
  return id;
}

export async function resolveUserId(
  valkey: Redis,
  userCode: string,
): Promise<string | null> {
  const cached = await valkey.get(userKey(userCode));
  if (cached) return cached;

  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
    .limit(1);

  if (row.length === 0) return null;

  const id = row[0].id;
  await valkey.set(userKey(userCode), id, "EX", CACHE_TTL);
  return id;
}

export async function resolveQuestionId(
  valkey: Redis,
  questionCode: string,
): Promise<string | null> {
  const cached = await valkey.get(questionKey(questionCode));
  if (cached) return cached;

  const row = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.questionCode, questionCode),
        eq(questions.isDeleted, false),
      ),
    )
    .limit(1);

  if (row.length === 0) return null;

  const id = row[0].id;
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
