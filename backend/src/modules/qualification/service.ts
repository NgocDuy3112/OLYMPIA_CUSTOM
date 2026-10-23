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
import { TournamentError } from "../tournaments/errors.js";
import { assemblyEligibility } from "../questions/service.js";
import { requireMatchScope, type MatchRow } from "../matches/service.js";
import { listEnrolled, requireEnrolled } from "../roster/service.js";
import { publish } from "../live/hub.js";

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
    if (!row) throw new TournamentError("NOT_FOUND", `match ${matchId} not found`);
    if (row.kind !== "QUALIFICATION") {
        throw new TournamentError("VALIDATION", `match ${matchId} is not a qualification match`);
    }
    return row;
}

function seatedUsers(match: MatchRow): string[] {
    return match.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);
}

// The released set: position ≤ current_position. An event that was closed without
// ever opening has released nothing — its results say "not played" for every question.
function releasedQuestions(match: MatchRow, current: number | null): MatchQuestion[] {
    if (current === null) return [];
    return match.questions
        .filter((question) => question.position <= current)
        .sort((a, b) => a.position - b.position);
}

function assertOpen(match: MatchRow): number {
    if (match.currentPosition === null) {
        throw new TournamentError("NOT_OPEN", "the staff have not opened this event yet");
    }
    return match.currentPosition;
}


// ── Creating it ───────────────────────────────────────────────────────────────

export async function createQualificationMatch(
    tournamentId: string,
    input: CreateQualificationMatchInput
): Promise<MatchRow> {
    const { tournament } = await requireMatchScope(tournamentId);

    if (!Number.isInteger(input.questionCount) || input.questionCount < 1) {
        throw new TournamentError("VALIDATION", "questionCount must be a positive integer");
    }
    if (Number.isNaN(Date.parse(input.scheduledAt))) {
        throw new TournamentError("VALIDATION", "scheduledAt must be an ISO date-time");
    }

    const roster = await listEnrolled(tournamentId);
    if (roster.length === 0) {
        throw new TournamentError("NOT_ENROLLED", "this tournament has no enrolled players");
    }

    const playerIds = input.playerIds && input.playerIds.length > 0
        ? input.playerIds
        : roster.map((row) => row.userId);
    await requireEnrolled(tournamentId, playerIds);

    if (new Set(playerIds).size !== playerIds.length) {
        throw new TournamentError("VALIDATION", "a player can only take one seat");
    }

    const questions = await pickQuestions(tournament, input.questionCount);

    const [row] = await db.insert(matches).values({
        tournamentId,
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
async function pickQuestions(tournament: { tags: string[] }, count: number): Promise<MatchQuestion[]> {
    const rows = await db
        .select()
        .from(questionBank)
        .where(and(...assemblyEligibility(tournament.tags), eq(questionBank.kind, "MC")))
        .orderBy(sql`random()`)
        .limit(count);

    if (rows.length < count) {
        throw new TournamentError(
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
        throw new TournamentError("NOT_ENROLLED", "you are not seated in this match");
    }

    const closed = match.status === "FINISHED";
    const current = match.currentPosition;

    // The staff have not released a question yet. Waiting and polling therefore
    // write NOTHING — the clock is the release, not the fetch.
    if (!closed && current === null) {
        throw new TournamentError("NOT_OPEN", "the staff have not opened this event yet");
    }

    const rows = await db.select().from(answers)
        .where(and(eq(answers.matchId, matchId), eq(answers.userId, userId)));

    return {
        closed,
        label: match.label,
        // Where the turns have reached, and the whole set's size (a count, never
        // the questions themselves — future ones are never sent).
        currentPosition: current,
        totalQuestions: match.questions.length,
        questions: releasedQuestions(match, current).map(sanitizeQuestion),
        answers: rows.map((row) => ({
            questionId: row.questionId,
            verdict: row.verdict,
            // The player's OWN submitted choice — the rows are filtered to their
            // userId, so review can show what they picked after a reload.
            value: row.value,
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
        throw new TournamentError("CLOSED", "this qualification match is closed");
    }
    if (!seatedUsers(match).includes(params.userId)) {
        throw new TournamentError("NOT_ENROLLED", "you are not seated in this match");
    }

    // Turns are enforced server-side: nothing released yet → not open.
    const current = assertOpen(match);

    const question = match.questions.find((q) => q._id === params.questionId);
    if (!question) {
        throw new TournamentError("NOT_FOUND", "question is not part of this match");
    }
    // A question past the turn is closed (staff advanced while this player was on it);
    // a question beyond the turn was never sent — it does not exist for a player.
    if (question.position > current) {
        throw new TournamentError("NOT_FOUND", "question has not been released");
    }
    if (question.position < current) {
        throw new TournamentError("CLOSED", "this question is closed");
    }

    const correct = autoMatch(question.kind as QuestionKind, question.payload, params.value);
    const verdict = correct ? "CORRECT" as const : "INCORRECT" as const;

    // The clock is the RELEASE of this question: one instant for the whole field,
    // server-owned, capped at MAX_ANSWER_MS. Waiting between turns never counts
    // against anyone, and a reload cannot move the anchor.
    const now = new Date();
    const anchor = match.releasedAt ?? now;
    const answeredMs = elapsedMs({
        openedAt: anchor.getTime(),
        lastAnswerAt: null
    }, now.getTime());

    try {
        await db.insert(answers).values({
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
    } catch (error) {
        const cause = (error as { cause?: { code?: string } }).cause
            ?? error as { code?: string };
        if (cause?.code === "23505") {
            throw new TournamentError(
                "ALREADY_ANSWERED",
                "this question has already been answered and cannot be changed"
            );
        }
        throw error;
    }

    return { verdict };
}


// ── The turns: staff open the event and advance the questions ───────────────
//
// Each transition releases the next question at a new server time — the clock
// anchor for everyone — and pushes the players to refetch. The compare-and-set
// where-clauses keep a double click (or two staff) from skipping a question.

export async function openQualificationMatch(matchId: string): Promise<MatchRow> {
    const match = await requireQualificationMatch(matchId);

    if (match.status === "FINISHED") {
        throw new TournamentError("CLOSED", "this qualification match is already closed");
    }

    const [opened] = await db.update(matches)
        .set({ currentPosition: 0, releasedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(matches.id, matchId), isNull(matches.currentPosition)))
        .returning();

    if (!opened) {
        throw new TournamentError("CONFLICT", "this event is already open");
    }

    await publish(matchId);
    return opened;
}

export async function advanceQualificationMatch(matchId: string): Promise<MatchRow> {
    const match = await requireQualificationMatch(matchId);

    if (match.status === "FINISHED") {
        throw new TournamentError("CLOSED", "this qualification match is already closed");
    }
    const current = assertOpen(match);
    if (current >= match.questions.length - 1) {
        throw new TournamentError("CONFLICT", "this is already the last question");
    }

    const [advanced] = await db.update(matches)
        .set({ currentPosition: current + 1, releasedAt: new Date(), updatedAt: new Date() })
        // Optimistic: only the reader who saw `current` advances; a racing staff
        // click matches no row and is told CONFLICT, never skips a question.
        .where(and(eq(matches.id, matchId), eq(matches.currentPosition, current)))
        .returning();

    if (!advanced) {
        throw new TournamentError("CONFLICT", "the event has moved on; reload");
    }

    await publish(matchId);
    return advanced;
}


// ── Closing it ────────────────────────────────────────────────────────────────

export async function closeQualificationMatch(
    matchId: string,
    options: CloseQualificationOptions = {}
): Promise<{ rows: Array<{ userId: string; rank: number; score: number }> }> {
    const match = await requireQualificationMatch(matchId);

    if (match.status === "FINISHED") {
        throw new TournamentError("CLOSED", "this qualification match is already closed");
    }

    const field = seatedUsers(match);
    if (field.length === 0) {
        throw new TournamentError("NOT_SETUP", "this match has nobody seated");
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
        throw new TournamentError(
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
                tournamentId: match.tournamentId,
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
            throw new TournamentError("CLOSED", "this qualification match is already closed");
        }
        throw error;
    }

    // The waiting-done players flip to results the moment the staff close.
    await publish(matchId);

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

    // The turn state the dialog runs on: where we are, when the current question
    // was released, and how much of the field has answered IT (the advance cue).
    const current = match.currentPosition;
    const currentQuestion = current === null
        ? undefined
        : match.questions.find((question) => question.position === current);
    const currentAnswered = currentQuestion
        ? rows.filter((row) => row.questionId === currentQuestion._id).length
        : 0;

    return {
        closed: match.status === "FINISHED",
        label: match.label,
        questionCount: match.questions.length,
        opened: current !== null,
        currentPosition: current,
        releasedAt: match.releasedAt ? match.releasedAt.toISOString() : null,
        currentAnswered,
        field: field.map((userId) => ({
            userId,
            displayName: names.get(userId) ?? userId,
            answered: answeredBy.get(userId) ?? 0
        })),
        results: result?.results ?? []
    };
}
