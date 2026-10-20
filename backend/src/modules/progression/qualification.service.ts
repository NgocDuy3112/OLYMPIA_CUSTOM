import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    questionBank,
    seasonPhaseAnswers,
    seasonPhaseResults,
    seasonPlayers,
    seasons
} from "../../db/schema/index.js";
import {
    assertValidProgression,
    type MatchQuestion,
    type Progression,
    type SubmittedAnswerValue
} from "../../game/contracts/index.js";
import { autoMatch, type QuestionKind } from "../../game/engine/matching.js";
import { QualificationError } from "./errors.js";
import {
    advancing,
    rankQualification,
    scoreQualification,
    type QualificationAnswer,
    type TieBreak
} from "./qualification.js";

export const QUALIFICATION_PHASE = "qualification";
const POINTS_PER_CORRECT = 1;

type SeasonRow = typeof seasons.$inferSelect;

export async function requireProgression(seasonId: string): Promise<{ season: SeasonRow; progression: Progression }> {
    const season = await requireSeason(seasonId);
    if (!season.progression) {
        throw new QualificationError("NO_PROGRESSION", "this season has no progression configured");
    }
    try {
        assertValidProgression(season.progression);
    } catch (error) {
        throw new QualificationError(
            "NO_PROGRESSION",
            error instanceof Error ? error.message : "invalid progression"
        );
    }
    return { season, progression: season.progression };
}

async function requireSeason(seasonId: string): Promise<SeasonRow> {
    const [row] = await db
        .select()
        .from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!row) throw new QualificationError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}

async function isClosed(seasonId: string): Promise<boolean> {
    const [row] = await db
        .select({ userId: seasonPhaseResults.userId })
        .from(seasonPhaseResults)
        .where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, QUALIFICATION_PHASE)
        ))
        .limit(1);
    return row !== undefined;
}

// ── Enrollment ────────────────────────────────────────────────────────────────

export async function enrollPlayers(seasonId: string, userIds: string[]): Promise<number> {
    await requireSeason(seasonId);
    if (userIds.length === 0) return 0;

    await db.insert(seasonPlayers)
        .values(userIds.map((userId) => ({ seasonId, userId })))
        .onConflictDoNothing();

    return (await listEnrolled(seasonId)).length;
}

export async function listEnrolled(seasonId: string): Promise<Array<{ userId: string; enrolledAt: Date }>> {
    return db
        .select({ userId: seasonPlayers.userId, enrolledAt: seasonPlayers.enrolledAt })
        .from(seasonPlayers)
        .where(eq(seasonPlayers.seasonId, seasonId));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

// Freeze the qualification questions into the season, exactly like match assembly copies
// from the bank: a live event must never depend on a later bank edit.
export async function setupQualification(
    seasonId: string,
    questionIds: string[],
    tournamentId: string
): Promise<MatchQuestion[]> {
    const { season, progression } = await requireProgression(seasonId);

    if (season.qualificationQuestions) {
        throw new QualificationError("ALREADY_SETUP", "qualification is already set up");
    }
    if (await isClosed(seasonId)) {
        throw new QualificationError("CLOSED", "qualification is already closed");
    }
    if (questionIds.length !== progression.questionCount) {
        throw new QualificationError(
            "VALIDATION",
            `expected ${progression.questionCount} questions, got ${questionIds.length}`
        );
    }

    const rows = await db.select().from(questionBank).where(inArray(questionBank.id, questionIds));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const copies: MatchQuestion[] = questionIds.map((id, position) => {
        const source = byId.get(id);
        if (!source) throw new QualificationError("NOT_FOUND", `question ${id} not found`);
        if (source.status !== "PUBLISHED") {
            throw new QualificationError("VALIDATION", `question ${id} is ${source.status}, not PUBLISHED`);
        }
        if (source.tournamentId !== null && source.tournamentId !== tournamentId) {
            throw new QualificationError("VALIDATION", `question ${id} belongs to another tournament`);
        }
        return {
            _id: randomUUID(),
            roundId: QUALIFICATION_PHASE,
            turnId: QUALIFICATION_PHASE,
            position,
            mode: "text",
            kind: source.kind,
            questionText: source.questionText,
            media: source.media ?? null,
            timeLimit: source.timeLimit,
            points: POINTS_PER_CORRECT,
            tag: source.tag,
            payload: source.payload,
            sourceId: source.id
        };
    });

    await db.update(seasons)
        .set({ qualificationQuestions: copies, updatedAt: new Date() })
        .where(eq(seasons.id, seasonId));

    return copies;
}

// ── Answering ─────────────────────────────────────────────────────────────────

export async function submitQualificationAnswer(params: {
    seasonId: string;
    userId: string;
    questionId: string;
    value: SubmittedAnswerValue;
    answeredMs?: number | null;
}): Promise<{ verdict: "CORRECT" | "INCORRECT" }> {
    const { season } = await requireProgression(params.seasonId);

    if (!season.qualificationQuestions) {
        throw new QualificationError("NOT_SETUP", "qualification is not set up");
    }
    if (await isClosed(params.seasonId)) {
        throw new QualificationError("CLOSED", "qualification is closed");
    }

    const [enrolled] = await db.select({ userId: seasonPlayers.userId })
        .from(seasonPlayers)
        .where(and(eq(seasonPlayers.seasonId, params.seasonId), eq(seasonPlayers.userId, params.userId)))
        .limit(1);
    if (!enrolled) {
        throw new QualificationError("NOT_ENROLLED", "you are not enrolled in this season");
    }

    const question = season.qualificationQuestions.find((q) => q._id === params.questionId);
    if (!question) {
        throw new QualificationError("NOT_FOUND", "question is not part of this qualification");
    }

    const correct = autoMatch(question.kind as QuestionKind, question.payload, params.value);
    const verdict = correct ? "CORRECT" as const : "INCORRECT" as const;
    // Points are crowd-weighted across the whole field, so they are only computed at close.
    const answeredMs = params.answeredMs ?? null;

    const [existing] = await db.select({ userId: seasonPhaseAnswers.userId })
        .from(seasonPhaseAnswers)
        .where(and(
            eq(seasonPhaseAnswers.seasonId, params.seasonId),
            eq(seasonPhaseAnswers.phaseId, QUALIFICATION_PHASE),
            eq(seasonPhaseAnswers.questionId, params.questionId),
            eq(seasonPhaseAnswers.userId, params.userId)
        ))
        .limit(1);
    if (existing) {
        throw new QualificationError(
            "ALREADY_ANSWERED",
            "this question has already been answered and cannot be changed"
        );
    }

    try {
        await db.insert(seasonPhaseAnswers)
            .values({
                seasonId: params.seasonId,
                phaseId: QUALIFICATION_PHASE,
                questionId: params.questionId,
                userId: params.userId,
                value: params.value,
                verdict,
                autoMatched: true,
                pointsAwarded: 0,
                answeredMs
            });
    } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause ?? error as { code?: string };
        if (cause?.code === "23505") {
            throw new QualificationError(
                "ALREADY_ANSWERED",
                "this question has already been answered and cannot be changed"
            );
        }
        throw error;
    }

    return { verdict };
}

// ── Closing ───────────────────────────────────────────────────────────────────

export interface CloseQualificationOptions {
    // Phase 1 has no tie-break turn: only needed if points, correct count AND average time
    // all agree on a group at or above the cut.
    tieBreaks?: TieBreak[];
}

export interface ClosedQualification {
    rows: Array<{ userId: string; points: number; correctCount: number; avgTimeMs: number; rank: number }>;
    advancing: string[];
}

export async function closeQualification(
    seasonId: string,
    options: CloseQualificationOptions = {}
): Promise<ClosedQualification> {
    const { season, progression } = await requireProgression(seasonId);

    if (!season.qualificationQuestions) {
        throw new QualificationError("NOT_SETUP", "qualification is not set up");
    }
    if (await isClosed(seasonId)) {
        throw new QualificationError("CLOSED", "qualification is already closed");
    }

    const roster = await listEnrolled(seasonId);
    if (roster.length < progression.advance) {
        throw new QualificationError(
            "NOT_ENOUGH_PLAYERS",
            `need at least ${progression.advance} players to advance that many, got ${roster.length}`
        );
    }

    const answers = await db.select().from(seasonPhaseAnswers)
        .where(and(
            eq(seasonPhaseAnswers.seasonId, seasonId),
            eq(seasonPhaseAnswers.phaseId, QUALIFICATION_PHASE)
        ));

    // z (silent players) is measured against the whole enrolled field, not just answerers.
    const scored: QualificationAnswer[] = answers.map((a) => ({
        userId: a.userId,
        questionId: a.questionId,
        verdict: a.verdict ?? "INCORRECT",
        answeredMs: a.answeredMs
    }));

    const { perAnswer, perPlayer } = scoreQualification(scored, roster.length);

    const entries = roster.map((entry) => {
        const score = perPlayer.get(entry.userId);
        return {
            userId: entry.userId,
            points: score?.points ?? 0,
            correctCount: score?.correctCount ?? 0,
            avgTimeMs: score?.avgTimeMs ?? Number.POSITIVE_INFINITY
        };
    });

    const ranking = rankQualification(entries, {
        tieBreaks: options.tieBreaks,
        advance: progression.advance
    });

    if (ranking.unresolved.length > 0) {
        throw new QualificationError(
            "TIES_UNRESOLVED",
            "points, correct count and average time all agree for these players; supply an order",
            ranking.unresolved.map((group) => group.join(", "))
        );
    }

    await db.transaction(async (tx) => {
        await tx.insert(seasonPhaseResults)
            .values(ranking.rows.map((row) => ({
                seasonId,
                phaseId: QUALIFICATION_PHASE,
                userId: row.userId,
                score: row.points,
                correctCount: row.correctCount,
                avgTimeMs: Number.isFinite(row.avgTimeMs) ? Math.round(row.avgTimeMs) : null,
                rank: row.rank
            })))
            .onConflictDoNothing();

        // Record each answer's crowd-weighted points for the ledger.
        for (const [key, points] of perAnswer) {
            const [questionId, userId] = key.split("|");
            await tx.update(seasonPhaseAnswers)
                .set({ pointsAwarded: points })
                .where(and(
                    eq(seasonPhaseAnswers.seasonId, seasonId),
                    eq(seasonPhaseAnswers.phaseId, QUALIFICATION_PHASE),
                    eq(seasonPhaseAnswers.questionId, questionId),
                    eq(seasonPhaseAnswers.userId, userId)
                ));
        }
    });

    return { rows: ranking.rows, advancing: advancing(ranking, progression.advance) };
}


// What a player may see: the question and its options, never the correct answer.
export function sanitizeQuestion(question: MatchQuestion) {
    const payload = question.kind === "MC"
        ? { options: (question.payload as { options: Array<{ id: string; text: string }> }).options }
        : {};
    return {
        questionId: question._id,
        kind: question.kind,
        position: question.position,
        questionText: question.questionText,
        media: question.media,
        timeLimit: question.timeLimit,
        tag: question.tag,
        payload
    };
}

export async function getQualificationForPlayer(seasonId: string, userId: string) {
    const { season } = await requireProgression(seasonId);
    if (!season.qualificationQuestions) {
        throw new QualificationError("NOT_SETUP", "qualification is not set up");
    }

    const [enrolled] = await db.select({ userId: seasonPlayers.userId })
        .from(seasonPlayers)
        .where(and(eq(seasonPlayers.seasonId, seasonId), eq(seasonPlayers.userId, userId)))
        .limit(1);
    if (!enrolled) {
        throw new QualificationError("NOT_ENROLLED", "you are not enrolled in this season");
    }

    const answers = await db.select().from(seasonPhaseAnswers)
        .where(and(
            eq(seasonPhaseAnswers.seasonId, seasonId),
            eq(seasonPhaseAnswers.phaseId, QUALIFICATION_PHASE),
            eq(seasonPhaseAnswers.userId, userId)
        ));

    return {
        closed: await isClosed(seasonId),
        questions: season.qualificationQuestions.map(sanitizeQuestion),
        answers: answers.map((a) => ({ questionId: a.questionId, verdict: a.verdict, points: a.pointsAwarded }))
    };
}

export async function getQualificationForStaff(seasonId: string) {
    const { season, progression } = await requireProgression(seasonId);
    const results = await db.select().from(seasonPhaseResults)
        .where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, QUALIFICATION_PHASE)
        ));

    return {
        closed: results.length > 0,
        questionCount: season.qualificationQuestions?.length ?? 0,
        advance: progression.advance,
        enrolled: (await listEnrolled(seasonId)).length,
        results: results.sort((a, b) => a.rank - b.rank)
    };
}
