// Phase 1: qualification.
//
// Scoring is crowd-weighted per question. With x players correct, y wrong and z silent
// (z = the rest of the enrolled field):
//   correct -> +(y + z)      a question few others got is worth more to those who did
//   wrong   -> -(x + z)      a question most others got costs more when you miss it
//   silent  -> 0
//
// Ranking, in order: total points, then correct answers, then the average time taken on
// the correct answers (faster is better). A group that still ties is unresolved: phase 1
// has no tie-break turn, so the caller must supply an order.
import { ProgressionError } from "../../game/contracts/index.js";

export type PhaseVerdict = "CORRECT" | "INCORRECT";

// Answer times are measured by the server, never taken on the client's word.
// The anchor is the player's last interaction with the phase: their first fetch of the
// question set, or their previous answer. A re-fetch does not move the anchor forward,
// so reloading the page cannot make a player look faster.
export interface TimingAnchor {
    openedAt: number;                  // epoch ms, server receive time of the first fetch
    lastAnswerAt: number | null;       // epoch ms, server receive time of the previous answer
}

// A player who leaves the tab open for a day must not dominate the ranking.
export const MAX_ANSWER_MS = 60 * 60 * 1000;

export function elapsedMs(anchor: TimingAnchor, now: number): number {
    const since = anchor.lastAnswerAt ?? anchor.openedAt;
    const raw = Math.max(0, now - since);
    return Math.min(raw, MAX_ANSWER_MS);
}

export interface QualificationAnswer {
    userId: string;
    questionId: string;
    verdict: PhaseVerdict;
    answeredMs?: number | null;
}

export interface QualificationEntry {
    userId: string;
    points: number;
    correctCount: number;
    avgTimeMs: number;      // Infinity when the player never answered correctly
}

export interface PlayerScore {
    points: number;
    correctCount: number;
    avgTimeMs: number;
}

// Per-answer points, keyed `${questionId}|${userId}`, plus per-player totals.
export function scoreQualification(
    answers: QualificationAnswer[],
    fieldSize: number
): { perAnswer: Map<string, number>; perPlayer: Map<string, PlayerScore> } {
    const byQuestion = new Map<string, QualificationAnswer[]>();
    for (const answer of answers) {
        const group = byQuestion.get(answer.questionId) ?? [];
        group.push(answer);
        byQuestion.set(answer.questionId, group);
    }

    const perAnswer = new Map<string, number>();
    const perPlayer = new Map<string, PlayerScore>();
    const ensure = (userId: string): PlayerScore => {
        const existing = perPlayer.get(userId);
        if (existing) return existing;
        const created: PlayerScore = { points: 0, correctCount: 0, avgTimeMs: 0 };
        perPlayer.set(userId, created);
        return created;
    };

    // Times are averaged over the correct answers only.
    const timeTotal = new Map<string, { sum: number; count: number }>();

    for (const [questionId, group] of byQuestion) {
        const x = group.filter((a) => a.verdict === "CORRECT").length;
        const y = group.filter((a) => a.verdict === "INCORRECT").length;
        const z = Math.max(0, fieldSize - x - y);

        for (const answer of group) {
            const score = ensure(answer.userId);
            const penalty = x + z;
            // Normalise -(0) so a question nobody got right is worth exactly zero.
            const points = answer.verdict === "CORRECT" ? y + z : (penalty === 0 ? 0 : -penalty);

            perAnswer.set(`${questionId}|${answer.userId}`, points);
            score.points += points;

            if (answer.verdict === "CORRECT") {
                score.correctCount += 1;
                const ms = answer.answeredMs ?? null;
                if (ms !== null) {
                    const entry = timeTotal.get(answer.userId) ?? { sum: 0, count: 0 };
                    entry.sum += ms;
                    entry.count += 1;
                    timeTotal.set(answer.userId, entry);
                }
            }
        }
    }

    for (const [userId, score] of perPlayer) {
        const timed = timeTotal.get(userId);
        score.avgTimeMs = score.correctCount === 0
            ? Number.POSITIVE_INFINITY           // no correct answers: ranked last on time
            : timed && timed.count > 0
                ? timed.sum / timed.count
                : 0;                             // correct but untimed: neutral
    }

    return { perAnswer, perPlayer };
}

export interface TieBreak {
    players: string[];
    order: string[];
}

export interface RankedPlayer {
    userId: string;
    points: number;
    correctCount: number;
    avgTimeMs: number;
    rank: number;
}

export interface QualificationRanking {
    rows: RankedPlayer[];
    unresolved: string[][];
}

export interface RankOptions {
    tieBreaks?: TieBreak[];
    advance?: number;
}

// Compare by the three criteria, in order.
export function compareEntries(a: QualificationEntry, b: QualificationEntry): number {
    if (a.points !== b.points) return b.points - a.points;
    if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
    if (a.avgTimeMs !== b.avgTimeMs) return a.avgTimeMs - b.avgTimeMs;
    return 0;
}

function keyOf(entry: QualificationEntry): string {
    return `${entry.points}|${entry.correctCount}|${entry.avgTimeMs}`;
}

// A group that starts at or above the cut changes who advances; below it, nobody cares.
export function rankQualification(
    entries: QualificationEntry[],
    options: RankOptions = {}
): QualificationRanking {
    const advance = options.advance ?? Number.POSITIVE_INFINITY;
    const orderFor = new Map<string, string[]>();

    for (const tieBreak of options.tieBreaks ?? []) {
        if (new Set(tieBreak.players).size !== tieBreak.players.length) {
            throw new ProgressionError("a tie-break lists the same player twice");
        }
        if (tieBreak.order.length !== tieBreak.players.length
            || new Set(tieBreak.order).size !== tieBreak.order.length) {
            throw new ProgressionError("a tie-break order must be a permutation of its players");
        }
        const keys = new Set(
            tieBreak.players.map((id) => {
                const entry = entries.find((e) => e.userId === id);
                if (!entry) throw new ProgressionError(`tie-break names an unknown player ${id}`);
                return keyOf(entry);
            })
        );
        if (keys.size !== 1) {
            throw new ProgressionError("a tie-break group is not actually tied");
        }
        orderFor.set([...tieBreak.players].sort().join("|"), tieBreak.order);
    }

    const groups = new Map<string, QualificationEntry[]>();
    for (const entry of entries) {
        const key = keyOf(entry);
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
    }

    const ordered = [...groups.values()].sort((a, b) => compareEntries(a[0], b[0]));

    const rows: RankedPlayer[] = [];
    const unresolved: string[][] = [];
    let place = 1;

    for (const group of ordered) {
        const emit = (entry: QualificationEntry) => {
            rows.push({
                userId: entry.userId,
                points: entry.points,
                correctCount: entry.correctCount,
                avgTimeMs: entry.avgTimeMs,
                rank: place++
            });
        };

        if (group.length === 1) {
            emit(group[0]);
            continue;
        }

        if (place > advance) {
            for (const entry of group) emit(entry);   // below the cut: order does not matter
            continue;
        }

        const order = orderFor.get(group.map((e) => e.userId).sort().join("|"));
        if (order === undefined) {
            unresolved.push(group.map((e) => e.userId));
            continue;
        }

        for (const userId of order) {
            emit(group.find((e) => e.userId === userId)!);
        }
    }

    return { rows, unresolved };
}

// The players who advance, in rank order.
export function advancing(ranking: QualificationRanking, advance: number): string[] {
    return [...ranking.rows]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, advance)
        .map((row) => row.userId);
}
