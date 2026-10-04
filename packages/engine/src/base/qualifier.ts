
export interface QualifierAttemptInput {
  playerId: string;
  isCorrect: boolean;
  responseTimeMs: number;
}

export interface QualifierQuestionResult {
  correctCount: number;
  wrongCount: number;
  noAnswerCount: number;
  perCorrect: number;
  perWrong: number;
  points: Record<string, number>;
}

export interface QualifierPlayerStat {
  playerId: string;
  totalPoints: number;
  correctCount: number;
  avgCorrectTimeSec: number;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const QUALIFIER_TIME_LIMIT_MS = 10_000;
export const QUALIFIER_TIME_LIMIT_SEC = 10;

export function isQualifierTimeout(responseTimeMs: number): boolean {
  return responseTimeMs > QUALIFIER_TIME_LIMIT_MS;
}

export function qualifierQuestionPoints(
  correctCount: number,
  wrongCount: number,
): { perCorrect: number; perWrong: number } {
  return { perCorrect: wrongCount, perWrong: correctCount === 0 ? 0 : -correctCount };
}

export function scoreQualifierQuestion(
  attempts: QualifierAttemptInput[],
  totalPlayers?: number,
): QualifierQuestionResult {
  let correctCount = 0;
  for (const a of attempts) if (a.isCorrect) correctCount++;
  const wrongCount = attempts.length - correctCount;
  const { perCorrect, perWrong } = qualifierQuestionPoints(correctCount, wrongCount);
  const points: Record<string, number> = {};
  for (const a of attempts) points[a.playerId] = a.isCorrect ? perCorrect : perWrong;
  const noAnswerCount =
    totalPlayers === undefined ? 0 : Math.max(0, totalPlayers - attempts.length);
  return {
    correctCount,
    wrongCount,
    noAnswerCount,
    perCorrect,
    perWrong,
    points,
  };
}

export function avgCorrectTimeSec(
  correctTimesMs: number[],
): number {
  if (correctTimesMs.length === 0) return Infinity;
  const sum = correctTimesMs.reduce((a, b) => a + b, 0);
  return round3(sum / correctTimesMs.length / 1000);
}

export function summarizeQualifierPlayers(
  perPlayer: Record<
    string,
    Array<{ points: number; isCorrect: boolean; responseTimeMs: number }>
  >,
): QualifierPlayerStat[] {
  return Object.entries(perPlayer).map(([playerId, rows]) => {
    let total = 0;
    let correct = 0;
    const times: number[] = [];
    for (const r of rows) {
      total += r.points;
      if (r.isCorrect) {
        correct++;
        times.push(r.responseTimeMs);
      }
    }
    return {
      playerId,
      totalPoints: total,
      correctCount: correct,
      avgCorrectTimeSec: avgCorrectTimeSec(times),
    };
  });
}

export function rankQualifierPlayers(
  stats: QualifierPlayerStat[],
  limit = 16,
): QualifierPlayerStat[] {
  return [...stats]
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.correctCount - a.correctCount ||
        a.avgCorrectTimeSec - b.avgCorrectTimeSec ||
        (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
    )
    .slice(0, limit);
}
