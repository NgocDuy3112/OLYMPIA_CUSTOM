/**
 * Vong loai — zero-sum scoring + top-16 ranking.
 *
 * Luat moi cau: X dung, Y sai, Z bo (Z = N - X - Y, N = tournament_players).
 *   dung +Y / nguoi, sai -X / nguoi, bo 0.
 *   X*Y + Y*(-X) = 0 → tong cau = 0.
 *
 * Xep hang 16 cau cong don:
 *   1. tong diem DESC
 *   2. tong cau dung DESC
 *   3. avg time cau dung ASC (giay, round 3 thap phan)
 *
 * Pure functions, no side effects.
 */

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
  /** Giay, round 3 decimals. Infinity = khong cau dung nao. */
  avgCorrectTimeSec: number;
}

/** Round 3 decimals. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Moi cau vong loai: 10s suy nghi + tra loi. */
export const QUALIFIER_TIME_LIMIT_MS = 10_000;
export const QUALIFIER_TIME_LIMIT_SEC = 10;

/** Qua 10s → het gio, tinh nhu bo qua. */
export function isQualifierTimeout(responseTimeMs: number): boolean {
  return responseTimeMs > QUALIFIER_TIME_LIMIT_MS;
}

/**
 * Diem moi cau tu X/Y.
 * perCorrect = +Y, perWrong = -X.
 */
export function qualifierQuestionPoints(
  correctCount: number,
  wrongCount: number,
): { perCorrect: number; perWrong: number } {
  return { perCorrect: wrongCount, perWrong: correctCount === 0 ? 0 : -correctCount };
}

/**
 * Cham 1 cau. attempts = rows da nop (thieu = bo, 0 diem).
 * totalPlayers (N) optional — co thi tinh Z, khong thi Z = 0.
 */
export function scoreQualifierQuestion(
  attempts: QualifierAttemptInput[],
  totalPlayers?: number,
): QualifierQuestionResult {
  let x = 0;
  for (const a of attempts) if (a.isCorrect) x++;
  const y = attempts.length - x;
  const { perCorrect, perWrong } = qualifierQuestionPoints(x, y);
  const points: Record<string, number> = {};
  for (const a of attempts) points[a.playerId] = a.isCorrect ? perCorrect : perWrong;
  const z =
    totalPlayers === undefined ? 0 : Math.max(0, totalPlayers - attempts.length);
  return {
    correctCount: x,
    wrongCount: y,
    noAnswerCount: z,
    perCorrect,
    perWrong,
    points,
  };
}

/** Avg time cau dung (giay, 3 decimals). 0 cau dung → Infinity. */
export function avgCorrectTimeSec(
  correctTimesMs: number[],
): number {
  if (correctTimesMs.length === 0) return Infinity;
  const sum = correctTimesMs.reduce((a, b) => a + b, 0);
  return round3(sum / correctTimesMs.length / 1000);
}

/**
 * Gom 16 cau thanh stat moi player.
 * perPlayer: playerId → mang moi cau { points, isCorrect, responseTimeMs }.
 * Thieu cau = bo, khong cong.
 */
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

/**
 * Xep hang + cat top N (default 16).
 * 1. totalPoints DESC, 2. correctCount DESC, 3. avgCorrectTimeSec ASC.
 * playerId ASC de deterministic khi hoa het.
 */
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
