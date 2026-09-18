import type { ScoreDelta } from "@oc/engine";
import { drizzleScoreRepo, type ScoreRepo } from "./score.repo.js";
import { drizzleMatchRepo, type MatchRepo } from "../match/match.repo.js";
import { resolveUserId } from "../../state/id-cache.js";
import type Redis from "ioredis";

interface ScoreAction {
  userCode: string;
  phase: string;
  payload: Record<string, unknown>;
}

interface ScoreServiceDeps {
  scoreRepo?: ScoreRepo;
  matchRepo?: MatchRepo;
  valkey?: Pick<Redis, "get"> | null;
}

/** Persist engine score deltas as immutable per-question records. */
export async function persistScoreDeltas(
  matchCode: string,
  action: ScoreAction,
  deltas: ScoreDelta[],
  deps: ScoreServiceDeps = {},
  valkey?: Pick<Redis, "get"> & {
    get(key: string): Promise<string | null>;
  } & Record<string, unknown>,
): Promise<void> {
  if (deltas.length === 0) return;
  const scoreRepo = deps.scoreRepo ?? drizzleScoreRepo;
  const matchRepo = deps.matchRepo ?? drizzleMatchRepo;

  const matchRow = await matchRepo.findByCode(matchCode);
  if (!matchRow) throw new Error(`Match not found: ${matchCode}`);

  const questionCode = String(action.payload.question_code ?? "");
  if (!questionCode) throw new Error("Score action is missing question_code");

  const questionRow = await scoreRepo.findQuestion(matchRow.id, questionCode);
  if (!questionRow) throw new Error(`Question not found: ${questionCode}`);

  const store = (deps.valkey ?? valkey ?? null) as Parameters<
    typeof resolveUserId
  >[0];
  const rows: Array<{
    points: number;
    playerId: string;
    matchId: string;
    questionId: string;
    questionCode: string;
  }> = [];
  for (const delta of [...new Set(deltas.map((d) => d.userCode))].map(
    (userCode) => deltas.find((d) => d.userCode === userCode)!,
  )) {
    let playerId: string | null = null;
    if (store) {
      playerId = await resolveUserId(store, delta.userCode);
    }
    if (!playerId) throw new Error(`User not found: ${delta.userCode}`);
    rows.push({
      points: delta.points,
      playerId,
      matchId: matchRow.id,
      questionId: questionRow.id,
      questionCode,
    });
  }

  await scoreRepo.insertRecords(rows);
}
