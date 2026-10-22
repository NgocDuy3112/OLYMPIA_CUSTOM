// The mass event, modelled as a match.
//
// A qualification match seats the whole roster (or a chosen subset) and gives every
// player the same question set, once. The answers are auto-marked, the time is measured
// by the server, and closing the match ranks the field by the crowd-weighted score.
//
// Everything lives on the ordinary match tables: the questions are frozen copies in
// `matches.questions`, the answers are rows in `answers`, and the closing ranking is the
// match's result. Nothing about it is a separate phase.
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    answers,
    matchClocks,
    matchResults,
    matches,
    questionBank,
    users
} from "../../db/schema/index.js";
import type { MatchQuestion, SubmittedAnswerValue } from "../../game/contracts/index.js";
import { autoMatch, type QuestionKind } from "../../game/engine/matching.js";
import {
    elapsedMs,
    rankQualification,
    scoreQualification,
    type QualificationAnswer,
    type TieBreak
} from "../../game/engine/scoring/crowd.js";
import { SeasonError } from "../seasons/errors.js";
import { assemblyEligibility } from "../questions/service.js";
import { requireMatchScope, type MatchRow } from "../matches/service.js";
import { listEnrolled, requireEnrolled } from "../roster/service.js";

const POINTS_PER_CORRECT = 1;

export interface CreateQualificationMatchInput {
    label: string;
    scheduledAt: string;
    stageId?: string;
    questionCount: number;
    playerIds?: string[];
}

export interface CloseQualificationOptions {
    // Only needed when points, correct count and average time all agree on a group.
    tieBreaks?: TieBreak[];
}

async function requireQualificationMatch(matchId: string): Promise<MatchRow> {
    const [row] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!row) throw new SeasonError("NOT_FOUND", `match ${matchId} not found`);
    if (row.kind !== "QUALIFICATION") {
        throw new SeasonError("VALIDATION", `match ${matchId} is not a qualification match`);
    }
    return row;
}

function seatedUsers(match: MatchRow): string[] {
    return match.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);
}


// ── Creating it ───────────────────────────────────────────────────────────────

export async function createQualificationMatch(
    tournamentId: string,
    seasonId: string,
    input: CreateQualificationMatchInput
): Promise<MatchRow> {
    const { season } = await requireMatchScope(tournamentId, seasonId);

    if (!Number.isInteger(input.questionCount) || input.questionCount < 1) {
        throw new SeasonError("VALIDATION", "questionCount must be a positive integer");
    }
    if (Number.isNaN(Date.parse(input.scheduledAt))) {
        throw new SeasonError("VALIDATION", "scheduledAt must be an ISO date-time");
    }

    const roster = await listEnrolled(seasonId);
    if (roster.length === 0) {
        throw new SeasonError("NOT_ENROLLED", "this season has no enrolled players");
    }

    const playerIds = input.playerIds && input.playerIds.length > 0
        ? input.playerIds
        : roster.map((row) => row.userId);
    await requireEnrolled(seasonId, playerIds);

    if (new Set(playerIds).size !== playerIds.length) {
        throw new SeasonError("VALIDATION", "a player can only take one seat");
    }

    const questions = await pickQuestions(tournamentId, input.questionCount);

    const [row] = await db.insert(matches).values({
        seasonId,
        kind: "QUALIFICATION",
        stageId: input.stageId ?? "qualification",
        label: input.label,
        scheduledAt: new Date(input.scheduledAt),
        status: "UPCOMING",
        players: playerIds.map((userId, seat) => ({ kind: "user" as const, userId, seed: seat + 1 })),
        roundConfigs: {},
        questions
    }).returning();

    return row;
}

// The question set is copied from the bank, so a running event never depends on later
// bank edits.
async function pickQuestions(tournamentId: string, count: number): Promise<MatchQuestion[]> {
    const rows = await db
        .select()
        .from(questionBank)
        .where(and(...assemblyEligibility(tournamentId), eq(questionBank.kind, "MC")))
        .orderBy(sql`random()`)
        .limit(count);

    if (rows.length < count) {
        throw new SeasonError(
            "NOT_ENOUGH_QUESTIONS",
            `the bank can supply ${rows.length} questions, the match needs ${count}`
        );
    }

    return rows.map((source, position) => ({
        _id: randomUUID(),
        roundId: "qualification",
        turnId: "qualification",
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
    }));
}


// ── Answering ─────────────────────────────────────────────────────────────────

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

export async function getQualificationForPlayer(matchId: string, userId: string) {
    const match = await requireQualificationMatch(matchId);

    if (!seatedUsers(match).includes(userId)) {
        throw new SeasonError("NOT_ENROLLED", "you are not seated in this match");
    }

    const rows = await db.select().from(answers)
        .where(and(eq(answers.matchId, matchId), eq(answers.userId, userId)));

    // The first fetch starts the player's clock. Later fetches never move it: reloading
    // the page must not make a player look faster.
    await db.insert(matchClocks)
        .values({ matchId, userId, openedAt: new Date() })
        .onConflictDoNothing();

    return {
        closed: match.status === "FINISHED",
        label: match.label,
        questions: match.questions.map(sanitizeQuestion),
        answers: rows.map((row) => ({
            questionId: row.questionId,
            verdict: row.verdict,
            pointsAwarded: row.pointsAwarded
        }))
    };
}

export async function submitQualificationAnswer(params: {
    matchId: string;
    userId: string;
    questionId: string;
    value: SubmittedAnswerValue;
}): Promise<{ verdict: "CORRECT" | "INCORRECT" }> {
    const match = await requireQualificationMatch(params.matchId);

    if (match.status === "FINISHED") {
        throw new SeasonError("CLOSED", "this qualification match is closed");
    }
    if (!seatedUsers(match).includes(params.userId)) {
        throw new SeasonError("NOT_ENROLLED", "you are not seated in this match");
    }

    const question = match.questions.find((q) => q._id === params.questionId);
    if (!question) {
        throw new SeasonError("NOT_FOUND", "question is not part of this match");
    }

    const correct = autoMatch(question.kind as QuestionKind, question.payload, params.value);
    const verdict = correct ? "CORRECT" as const : "INCORRECT" as const;

    // The time is the server's: from the player's last interaction with the match to now.
    const now = new Date();
    const [clock] = await db.select().from(matchClocks).where(and(
        eq(matchClocks.matchId, params.matchId),
        eq(matchClocks.userId, params.userId)
    )).limit(1);

    const answeredMs = elapsedMs({
        openedAt: (clock?.openedAt ?? now).getTime(),
        lastAnswerAt: clock?.lastAnswerAt ? clock.lastAnswerAt.getTime() : null
    }, now.getTime());

    try {
        await db.transaction(async (tx) => {
            await tx.insert(matchClocks)
                .values({ matchId: params.matchId, userId: params.userId, openedAt: now })
                .onConflictDoNothing();

            await tx.insert(answers).values({
                matchId: params.matchId,
                questionId: params.questionId,
                userId: params.userId,
                value: params.value,
                autoMatched: true,
                judged: true,
                verdict,
                answeredMs,
                firstAnsweredMs: answeredMs,
                pointsAwarded: 0
            });

            await tx.update(matchClocks)
                .set({ lastAnswerAt: now })
                .where(and(
                    eq(matchClocks.matchId, params.matchId),
                    eq(matchClocks.userId, params.userId)
                ));
        });
    } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause
            ?? error as { code?: string };
        if (cause?.code === "23505") {
            throw new SeasonError(
                "ALREADY_ANSWERED",
                "this question has already been answered and cannot be changed"
            );
        }
        throw error;
    }

    return { verdict };
}


// ── Closing it ────────────────────────────────────────────────────────────────

export async function closeQualificationMatch(
    matchId: string,
    options: CloseQualificationOptions = {}
): Promise<{ rows: Array<{ userId: string; rank: number; score: number }> }> {
    const match = await requireQualificationMatch(matchId);

    if (match.status === "FINISHED") {
        throw new SeasonError("CLOSED", "this qualification match is already closed");
    }

    const field = seatedUsers(match);
    if (field.length === 0) {
        throw new SeasonError("NOT_SETUP", "this match has nobody seated");
    }

    const rows = await db.select().from(answers).where(eq(answers.matchId, matchId));

    // z (silent players) is measured against the whole field, not just the answerers.
    const scored: QualificationAnswer[] = rows.map((row) => ({
        userId: row.userId,
        questionId: row.questionId,
        verdict: row.verdict ?? "INCORRECT",
        answeredMs: row.answeredMs
    }));

    const { perPlayer } = scoreQualification(scored, field.length);

    const entries = field.map((userId) => {
        const score = perPlayer.get(userId);
        return {
            userId,
            points: score?.points ?? 0,
            correctCount: score?.correctCount ?? 0,
            avgTimeMs: score?.avgTimeMs ?? Number.POSITIVE_INFINITY
        };
    });

    const ranking = rankQualification(entries, { tieBreaks: options.tieBreaks });

    if (ranking.unresolved.length > 0) {
        throw new SeasonError(
            "TIES_UNRESOLVED",
            "points, correct count and average time all agree for these players; supply an order",
            ranking.unresolved.map((group) => group.join(", "))
        );
    }

    const results = ranking.rows.map((row) => ({
        kind: "user" as const,
        userId: row.userId,
        totalScore: row.points,
        rank: row.rank,
        roundScores: {} as Record<string, number>
    }));

    try {
        await db.transaction(async (tx) => {
            await tx.insert(matchResults).values({
                matchId,
                seasonId: match.seasonId,
                results
            });

            // The crowd-weighted points belong on the answer rows, for the ledger.
            const { perAnswer } = scoreQualification(scored, field.length);
            for (const [key, points] of perAnswer) {
                const [questionId, userId] = key.split("|");
                await tx.update(answers)
                    .set({ pointsAwarded: points })
                    .where(and(
                        eq(answers.matchId, matchId),
                        eq(answers.questionId, questionId),
                        eq(answers.userId, userId)
                    ));
            }

            await tx.update(matches)
                .set({ status: "FINISHED", updatedAt: new Date() })
                .where(eq(matches.id, matchId));
        });
    } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause
            ?? error as { code?: string };
        if (cause?.code === "23505") {
            throw new SeasonError("CLOSED", "this qualification match is already closed");
        }
        throw error;
    }

    return {
        rows: ranking.rows.map((row) => ({
            userId: row.userId,
            rank: row.rank,
            score: row.points
        }))
    };
}

// What the staff see: how many answers each question has, and who has not answered yet.
export async function getQualificationForStaff(matchId: string) {
    const match = await requireQualificationMatch(matchId);

    const rows = await db.select().from(answers).where(eq(answers.matchId, matchId));
    const field = seatedUsers(match);

    const answeredBy = new Map<string, number>();
    for (const row of rows) {
        answeredBy.set(row.userId, (answeredBy.get(row.userId) ?? 0) + 1);
    }

    const names = field.length === 0
        ? new Map<string, string>()
        : new Map((await db.select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, field)))
            .map((row) => [row.id, row.displayName]));

    const [result] = await db.select().from(matchResults)
        .where(eq(matchResults.matchId, matchId))
        .limit(1);

    return {
        closed: match.status === "FINISHED",
        label: match.label,
        questionCount: match.questions.length,
        field: field.map((userId) => ({
            userId,
            displayName: names.get(userId) ?? userId,
            answered: answeredBy.get(userId) ?? 0
        })),
        results: result?.results ?? []
    };
}
