import { and, eq } from "drizzle-orm";
import { db, matches, questions, records, users } from "@oc/db";
import type { ScoreDelta } from "@oc/engine";

interface ScoreAction {
  userCode: string;
  phase: string;
  payload: Record<string, unknown>;
}

/** Persist engine score deltas as immutable per-question records. */
export async function persistScoreDeltas(
  matchCode: string,
  action: ScoreAction,
  deltas: ScoreDelta[],
): Promise<void> {
  if (deltas.length === 0) return;

  const matchRows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.matchCode, matchCode), eq(matches.isDeleted, false)))
    .limit(1);
  if (matchRows.length === 0) throw new Error(`Match not found: ${matchCode}`);

  const questionCode = String(action.payload.question_code ?? "");
  if (!questionCode) throw new Error("Score action is missing question_code");

  const questionRows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.matchId, matchRows[0].id),
        eq(questions.questionCode, questionCode),
        eq(questions.isDeleted, false),
      ),
    )
    .limit(1);
  if (questionRows.length === 0)
    throw new Error(`Question not found: ${questionCode}`);

  const userCodes = [...new Set(deltas.map((delta) => delta.userCode))];
  const userRows = await db
    .select({ id: users.id, userCode: users.userCode })
    .from(users)
    .where(eq(users.isDeleted, false));
  const userIds = new Map(
    userRows
      .filter((user) => userCodes.includes(user.userCode))
      .map((user) => [user.userCode, user.id]),
  );

  const rows = deltas.map((delta) => {
    const playerId = userIds.get(delta.userCode);
    if (!playerId) throw new Error(`User not found: ${delta.userCode}`);
    return {
      points: delta.points,
      playerId,
      matchId: matchRows[0].id,
      questionId: questionRows[0].id,
      questionCode,
    };
  });

  await db.insert(records).values(rows);
}
