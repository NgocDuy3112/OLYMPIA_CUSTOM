// Postgres-backed LiveStore. Every MC action runs inside one transaction that locks
// the match_live row, so concurrent actions serialize and a rollback leaves no trace.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchEvents, matchLive, users } from "../../db/schema/index.js";
import type { AnswerDraft, LiveRecord, LiveStore, LiveTx } from "./apply.js";
import type { LiveFact } from "./facts.js";
import { RuleError } from "../../game/engine/turns/errors.js";

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

                        const judgeRows = facts.filter((f) => f.type === "judge");
                        for (const f of judgeRows) {
                            const updated = await tx.update(answers)
                                .set({ verdict: f.verdict, judged: true, pointsAwarded: f.pointsAwarded })
                                .where(and(
                                    eq(answers.matchId, matchId),
                                    eq(answers.questionId, f.questionId),
                                    eq(answers.userId, f.userId)
                                ))
                                .returning({ id: answers.id });
                            // Judging an answer nobody submitted is a mistake, not a no-op.
                            if (updated.length === 0) {
                                throw new RuleError(
                                    "NO_ANSWER",
                                    `no submitted answer to judge for question ${f.questionId}`
                                );
                            }
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
                    async readAnswerDrafts(questionId: string): Promise<AnswerDraft[]> {
                        const rows = await tx
                            .select({
                                userId: answers.userId,
                                drafts: answers.drafts,
                                answeredMs: answers.answeredMs,
                                judged: answers.judged
                            })
                            .from(answers)
                            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, questionId)));

                        return rows.map((r) => {
                            const draft = r.drafts?.["auto"];
                            return {
                                userId: r.userId,
                                suggestion: draft === undefined ? null : draft,
                                answeredMs: r.answeredMs,
                                judged: r.judged
                            };
                        });
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

// The auto-matcher's suggestion for an answer, pending the controller's final verdict.
// Written outside the version-guarded flow: it does not change round state.
export const AUTO_DRAFTER = "auto";

export async function writeDraft(params: {
    matchId: string;
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] };
    suggestion: "CORRECT" | "INCORRECT";
    draftedBy?: string;
    answeredMs?: number;      // ms from the question opening; the round's clock source
    revise?: boolean;         // default true; but-pha allows only one attempt
}): Promise<void> {
    const draftedBy = params.draftedBy ?? AUTO_DRAFTER;
    const where = and(
        eq(answers.matchId, params.matchId),
        eq(answers.questionId, params.questionId),
        eq(answers.userId, params.userId)
    );

    const [existing] = await db.select().from(answers).where(where).limit(1);
    if (existing?.judged) {
        throw new RuleError("ALREADY_JUDGED", "this answer already has a final verdict");
    }

    const drafts = { ...(existing?.drafts ?? {}), [draftedBy]: params.suggestion };

    if (existing) {
        if (params.revise === false) {
            throw new RuleError("ALREADY_ANSWERED", "this question already has an answer");
        }
        await db.update(answers)
            .set({
                value: params.value,
                drafts,
                // answered_ms follows every revision; first_answered_ms is set once
                ...(params.answeredMs === undefined ? {} : { answeredMs: params.answeredMs })
            })
            .where(where);
    } else {
        await db.insert(answers).values({
            matchId: params.matchId,
            questionId: params.questionId,
            userId: params.userId,
            value: params.value,
            drafts,
            judged: false,
            ...(params.answeredMs === undefined
                ? {}
                : { firstAnsweredMs: params.answeredMs, answeredMs: params.answeredMs })
        });
    }
}

// Each player's cumulative points in the match so far. ve-dich orders its first phase by
// score, and everyone starts ve-dich at zero, so the seed must be the earlier rounds.
export async function sumPointsByPlayer(matchId: string): Promise<Record<string, number>> {
    const rows = await db
        .select({ userId: answers.userId, points: answers.pointsAwarded })
        .from(answers)
        .where(eq(answers.matchId, matchId));

    const sums: Record<string, number> = {};
    for (const row of rows) {
        sums[row.userId] = (sums[row.userId] ?? 0) + (row.points ?? 0);
    }
    return sums;
}

// Is the session behind a live socket still valid? Mirrors the HTTP guard: the account
// must exist, not be disabled, and not have been revoked via tokenVersion.
export async function isSessionActive(userId: string, tokenVersion: number): Promise<boolean> {
    const [row] = await db
        .select({ disabledAt: users.disabledAt, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    return row !== undefined && row.disabledAt === null && row.tokenVersion === tokenVersion;
}

// A player's own answers in a match, so the player view knows what they have submitted.
export async function readPlayerAnswers(
    matchId: string,
    userId: string
): Promise<Array<{ questionId: string; judged: boolean }>> {
    return db
        .select({ questionId: answers.questionId, judged: answers.judged })
        .from(answers)
        .where(and(eq(answers.matchId, matchId), eq(answers.userId, userId)));
}

// The answers for a question, for the controller to review before judging.
export async function readQuestionAnswers(matchId: string, questionId: string) {
    return db.select({
        userId: answers.userId,
        value: answers.value,
        drafts: answers.drafts,
        verdict: answers.verdict,
        judged: answers.judged,
        pointsAwarded: answers.pointsAwarded
    }).from(answers).where(and(eq(answers.matchId, matchId), eq(answers.questionId, questionId)));
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

