// Postgres-backed LiveStore. Every MC action runs inside one transaction that locks
// the match_live row, so concurrent actions serialize and a rollback leaves no trace.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchEvents, matchLive } from "../../db/schema/index.js";
import type { LiveRecord, LiveStore } from "./apply.js";
import type { LiveFact } from "./facts.js";

// The transaction handle the pure orchestration works against. Matches LiveStore.transact.
type LiveTx<S> = {
    load(): Promise<LiveRecord<S>>;
    save(next: LiveRecord<S>): Promise<void>;
    recordFacts(facts: LiveFact[]): Promise<void>;
    readAnswers(questionId: string): Promise<Record<string, boolean>>;
};

export class LiveNotFoundError extends Error {
    constructor(matchId: string) {
        super(`no live round for match ${matchId}`);
        this.name = "LiveNotFoundError";
    }
}

export function pgLiveStore<S>(matchId: string): LiveStore<S> {
    return {
        transact<T>(fn: (tx: LiveTx<S>) => Promise<T>): Promise<T> {
            return db.transaction(async (tx) => {
                // FOR UPDATE: a second concurrent action waits here until this one commits.
                const [row] = await tx
                    .select()
                    .from(matchLive)
                    .where(eq(matchLive.matchId, matchId))
                    .for("update")
                    .limit(1);

                if (!row) throw new LiveNotFoundError(matchId);

                return fn({
                    async load(): Promise<LiveRecord<S>> {
                        return {
                            version: row.version,
                            roundId: row.roundId,
                            state: row.state as unknown as S
                        };
                    },
                    async save(next: LiveRecord<S>): Promise<void> {
                        await tx
                            .update(matchLive)
                            .set({
                                version: next.version,
                                roundId: next.roundId,
                                state: next.state as Record<string, unknown>,
                                updatedAt: new Date()
                            })
                            .where(eq(matchLive.matchId, matchId));
                    },
                    // Facts are idempotent: the unique keys on answers and match_events
                    // make a retried write harmless, so a double submit cannot double-count.
                    async recordFacts(facts: LiveFact[]): Promise<void> {
                        const answerRows = facts.filter((f) => f.type === "answer");
                        if (answerRows.length > 0) {
                            await tx.insert(answers).values(answerRows.map((f) => ({
                                matchId,
                                questionId: f.questionId,
                                userId: f.userId,
                                value: f.value,
                                autoMatched: f.autoMatched,
                                judged: true,
                                verdict: f.verdict,
                                pointsAwarded: f.pointsAwarded
                            }))).onConflictDoNothing();
                        }

                        const eventRows = facts.filter((f) => f.type === "event");
                        if (eventRows.length > 0) {
                            await tx.insert(matchEvents).values(eventRows.map((f) => ({
                                matchId,
                                questionId: f.questionId,
                                userId: f.userId,
                                roundId: f.roundId,
                                kind: f.kind,
                                payload: f.payload
                            }))).onConflictDoNothing();
                        }
                    },
                    async readAnswers(questionId: string): Promise<Record<string, boolean>> {
                        const rows = await tx
                            .select({ userId: answers.userId, verdict: answers.verdict })
                            .from(answers)
                            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, questionId)));
                        return Object.fromEntries(rows.map((r) => [r.userId, r.verdict === "CORRECT"]));
                    }
                });
            });
        }
    };
}

// A player's answer, written outside the version-guarded flow: it does not change the
// round state, so it never conflicts with the MC. Revision is allowed while the window is
// open, so the LAST answer wins.
export async function recordPlayerAnswer(params: {
    matchId: string;
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] };
    verdict: "CORRECT" | "INCORRECT";
}): Promise<void> {
    await db.insert(answers).values({
        matchId: params.matchId,
        questionId: params.questionId,
        userId: params.userId,
        value: params.value,
        autoMatched: true,
        judged: true,
        verdict: params.verdict,
        pointsAwarded: 0
    }).onConflictDoUpdate({
        target: [answers.matchId, answers.questionId, answers.userId],
        set: {
            value: params.value,
            verdict: params.verdict,
            autoMatched: true,
            judged: true,
            submittedAt: new Date()
        }
    });
}

// Current version and state, for the console to reload after a 409.
export async function readLive(matchId: string): Promise<{
    version: number;
    roundId: string;
    state: Record<string, unknown>;
} | null> {
    const [row] = await db
        .select({ version: matchLive.version, roundId: matchLive.roundId, state: matchLive.state })
        .from(matchLive)
        .where(eq(matchLive.matchId, matchId))
        .limit(1);
    return row ? { version: row.version, roundId: row.roundId, state: row.state } : null;
}

