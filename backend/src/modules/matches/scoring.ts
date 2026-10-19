// Match-end scoring. Pure: given the competitors and the recorded answers, produce the
// frozen result. No I/O, so the ranking rules are unit-testable.
import type { ResultEntry } from "../../game/contracts/index.js";

export interface AnswerForScoring {
    userId: string;
    roundId: string;
    pointsAwarded: number;
}

export interface MatchResultInput {
    competitors: Array<{ userId: string }>;
    answers: AnswerForScoring[];
}

// Dense ranking: equal totals share a rank, and the next distinct total takes the next
// rank (scores 100, 90, 90, 80 -> ranks 1, 2, 2, 3). Points are signed, so negatives rank
// below zero.
export function denseRanks(entries: Array<{ key: string; total: number }>): Map<string, number> {
    const sorted = [...entries].sort((a, b) => b.total - a.total);
    const ranks = new Map<string, number>();
    let rank = 0;
    let lastTotal: number | null = null;

    for (const entry of sorted) {
        if (lastTotal === null || entry.total !== lastTotal) {
            rank += 1;
            lastTotal = entry.total;
        }
        ranks.set(entry.key, rank);
    }
    return ranks;
}

export function buildMatchResults(input: MatchResultInput): ResultEntry[] {
    const byUser = new Map<string, { total: number; roundScores: Record<string, number> }>();
    for (const competitor of input.competitors) {
        byUser.set(competitor.userId, { total: 0, roundScores: {} });
    }

    for (const answer of input.answers) {
        // Answers from someone who is not a competitor are ignored, not invented.
        const bucket = byUser.get(answer.userId);
        if (!bucket) continue;
        bucket.total += answer.pointsAwarded;
        bucket.roundScores[answer.roundId] =
            (bucket.roundScores[answer.roundId] ?? 0) + answer.pointsAwarded;
    }

    const ranks = denseRanks([...byUser].map(([key, value]) => ({ key, total: value.total })));

    return [...byUser]
        .map(([userId, value]) => ({
            kind: "user" as const,
            userId,
            totalScore: value.total,
            rank: ranks.get(userId) ?? 0,
            roundScores: value.roundScores
        }))
        .sort((a, b) => a.rank - b.rank || a.userId.localeCompare(b.userId));
}
