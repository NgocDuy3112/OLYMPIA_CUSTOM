import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchEvents, matchLive, scoreAdjustments, users } from "../../db/schema/index.js";
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
                            state: row.state as unknown as S,
                            archive: (row.archive ?? {}) as Record<string, S>
                        };
                    },
                    async save(next: LiveRecord<S>): Promise<void> {
                        await tx
                            .update(matchLive)
                            .set({
                                version: next.version,
                                roundId: next.roundId,
                                state: next.state as Record<string, unknown>,
                                ...(next.archive !== undefined
                                    ? { archive: next.archive as Record<string, Record<string, unknown>> }
                                    : {}),
                                updatedAt: new Date()
                            })
                            .where(eq(matchLive.matchId, matchId));
                    },
                    async recordFacts(facts: LiveFact[]): Promise<void> {
                        const draftRows = facts.filter((f) => f.type === "draft");
                        if (draftRows.length > 0) {
                            await tx.insert(answers).values(draftRows.map((f) => ({
                                matchId,
                                questionId: f.questionId,
                                userId: f.userId,
                                value: f.value,
                                drafts: { auto: f.suggestion },
                                judged: false
                            }))).onConflictDoNothing();
                        }

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

                        const adjustRows = facts.filter((f) => f.type === "adjust");
                        if (adjustRows.length > 0) {
                            await tx.insert(scoreAdjustments).values(adjustRows.map((f) => ({
                                matchId,
                                userId: f.userId,
                                delta: f.delta,
                                reason: f.reason,
                                createdBy: f.actorId
                            })));
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
                });
            });
        }
    };
}

export const AUTO_DRAFTER = "auto";

export async function writeDraft(params: {
    matchId: string;
    questionId: string;
    userId: string;
    value: { text: string } | { picked: string[] };
    suggestion: "CORRECT" | "INCORRECT";
    draftedBy?: string;
    answeredMs?: number;      
    revise?: boolean;         
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

export async function sumAdjustmentsByPlayer(matchId: string): Promise<Record<string, number>> {
    const rows = await db
        .select({ userId: scoreAdjustments.userId, delta: scoreAdjustments.delta })
        .from(scoreAdjustments)
        .where(eq(scoreAdjustments.matchId, matchId));

    const sums: Record<string, number> = {};
    for (const row of rows) {
        sums[row.userId] = (sums[row.userId] ?? 0) + row.delta;
    }
    return sums;
}

export async function isSessionActive(userId: string, tokenVersion: number): Promise<boolean> {
    const [row] = await db
        .select({ disabledAt: users.disabledAt, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    return row !== undefined && row.disabledAt === null && row.tokenVersion === tokenVersion;
}

export async function readPlayerAnswers(matchId: string, userId: string): Promise<Array<{
    questionId: string;
    judged: boolean;
    verdict: "CORRECT" | "INCORRECT" | null;
}>> {
    return db
        .select({
            questionId: answers.questionId,
            judged: answers.judged,
            verdict: answers.verdict
        })
        .from(answers)
        .where(and(eq(answers.matchId, matchId), eq(answers.userId, userId)));
}

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

export async function readJudgedAnswers(matchId: string): Promise<Array<{
    questionId: string;
    userId: string;
    verdict: "CORRECT" | "INCORRECT" | null;
}>> {
    return db.select({
        questionId: answers.questionId,
        userId: answers.userId,
        verdict: answers.verdict
    }).from(answers).where(and(eq(answers.matchId, matchId), eq(answers.judged, true)));
}

export async function readLive(matchId: string): Promise<{
    version: number;
    roundId: string;
    state: Record<string, unknown>;
    archive: Record<string, Record<string, unknown>>;
} | null> {
    const [row] = await db
        .select({ version: matchLive.version, roundId: matchLive.roundId, state: matchLive.state, archive: matchLive.archive })
        .from(matchLive)
        .where(eq(matchLive.matchId, matchId))
        .limit(1);
    return row
        ? { version: row.version, roundId: row.roundId, state: row.state, archive: row.archive ?? {} }
        : null;
}

