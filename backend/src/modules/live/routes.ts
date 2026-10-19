import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth, requireRole } from "../../lib/guards.js";
import { getMatch, getMatchById, requireMatchScope } from "../matches/service.js";
import { nextRoundId, orderedMatchRounds } from "../matches/rounds.js";
import { isSeatedInMatch } from "../matches/seats.js";
import { canWriteTournament } from "../../lib/tournament-access.js";
import { applyLiveAction, mutateLive, type Transition } from "./apply.js";
import { LiveConflictError } from "./conflict.js";
import { readLive, recordPlayerAnswer, LiveNotFoundError, pgLiveStore } from "./store.js";
import { RuleError } from "../../game/engine/turns/errors.js";
import { LiveActionSchema, type ButPhaAction, type GiaiMaAction, type KhoiDongAction, type LiveAction } from "./actions.js";
import { applyGiaiMaAction, type GiaiMaContext } from "./giai-ma.js";
import { applyButPhaAction } from "./but-pha.js";
import { applyKhoiDongAction } from "./khoi-dong.js";
import { LiveStateError, parseButPhaState, parseGiaiMaState, parseKhoiDongState } from "./state.js";
import { canPlayerAnswer, giaiMaPoints, isWindowOpen, startGiaiMa, type GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import {
    elapsedSeconds,
    openQuestionId,
    QUESTION_LIMIT_S,
    type ButPhaState
} from "../../game/engine/turns/but-pha.js";
import {
    elapsedPhase2Seconds,
    type KhoiDongState
} from "../../game/engine/turns/khoi-dong-round.js";
import { PHASE2_BUDGET_S } from "../../game/engine/turns/khoi-dong.js";
import { autoMatch, type QuestionKind } from "../../game/engine/matching.js";
import {
    SubmittedAnswerValueSchema,
    type SubmittedAnswerValue,
    type MatchQuestion
} from "../../game/contracts/index.js";

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

// giai-ma.start replaces the state wholesale, so the incoming state is irrelevant.
const EMPTY_GIAI_MA: GiaiMaState = startGiaiMa([], []);

// khoi-dong.start replaces the state wholesale; this placeholder only satisfies the types.
const EMPTY_KHOI_DONG: KhoiDongState = {
    stage: "phase1", ended: false, order: [], activeIndex: 0, runs: {}, phase2: null, phase2OpenedAt: null
};

// but-pha.start replaces the state wholesale; this placeholder only satisfies the types.
const EMPTY_BUT_PHA: ButPhaState = {
    questionIds: [], cursor: 0, questionOpenedAt: null, answers: {}, points: {}, ended: false
};

// khoi-dong runs two turns: phase 1 (oral) then phase 2 (typed). The turn order comes from
// the match's round config, so the split is server-authoritative, not client-chosen.
function khoiDongContext(
    match: { questions: MatchQuestion[]; roundConfigs: Record<string, { turns: Array<{ id: string }> }>; players: unknown },
    roundId: string,
    actorId: string,
    now: string
) {
    const turns = match.roundConfigs[roundId]?.turns ?? [];
    const questions = match.questions.filter((q) => q.roundId === roundId).sort((a, b) => a.position - b.position);
    const idsForTurn = (turnId: string | undefined) =>
        turnId === undefined ? [] : questions.filter((q) => q.turnId === turnId).map((q) => q._id);

    return {
        actorId,
        roundId,
        now,
        playerIds: (match.players as Array<{ kind: string; userId?: string }>)
            .filter((seat) => seat.kind === "user")
            .map((seat) => seat.userId!),
        phase1QuestionIds: idsForTurn(turns[0]?.id),
        phase2QuestionIds: idsForTurn(turns[1]?.id)
    };
}

// The match's questions for a round, in position order. Resolved server-side, so a client
// never chooses which questions a round plays.
function roundQuestionIds(match: { questions: MatchQuestion[] }, roundId: string): string[] {
    return match.questions
        .filter((q) => q.roundId === roundId)
        .sort((a, b) => a.position - b.position)
        .map((q) => q._id);
}

const matchParams = {
    type: "object",
    required: ["tournamentId", "seasonId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const matchIdParams = {
    type: "object",
    required: ["matchId"],
    additionalProperties: false,
    properties: { matchId: { type: "string", pattern: UUID_PATTERN } },
} as const;

const actionBody = {
    type: "object",
    required: ["expectedVersion", "action"],
    additionalProperties: false,
    properties: {
        expectedVersion: { type: "integer", minimum: 0 },
        action: { type: "object" },
    },
} as const;

const playerAnswerBody = {
    type: "object",
    required: ["questionId", "value"],
    additionalProperties: false,
    properties: {
        questionId: { type: "string", pattern: UUID_PATTERN },
        value: { type: "object" },
    },
} as const;

// Server-authoritative context for a giai-ma action: turnId and question membership come
// from the assembled questions, never from the client.
function giaiMaContext(
    app: FastifyInstance,
    match: { questions: MatchQuestion[] },
    action: LiveAction,
    roundId: string,
    actorId: string,
    submittedAnswers: Record<string, boolean>
): GiaiMaContext {
    let hintTurnId = "";

    if (action.kind === "giai-ma.openHint") {
        const q = match.questions.find((candidate) => candidate._id === action.hintId);
        if (!q) throw app.httpErrors.badRequest("hint is not a question of this match");
        if (q.roundId !== roundId) {
            throw app.httpErrors.badRequest("hint is not part of the current round");
        }
        hintTurnId = q.turnId;
    }

    if (action.kind === "giai-ma.submitKeyword") {
        const q = match.questions.find((candidate) => candidate._id === action.questionId);
        if (!q) throw app.httpErrors.badRequest("question is not part of this match");
        if (q.kind !== "KEYWORD") {
            throw app.httpErrors.badRequest("the keyword question must be of kind KEYWORD");
        }
    }

    return {
        actorId, roundId, hintTurnId, submittedAnswers,
        now: new Date().toISOString(),
        keywordAutoMatched: false           // the MC asserted the verdict
    };
}

function isRoundEnded(roundId: string, raw: unknown): boolean {
    const value = raw as Record<string, unknown> | null;
    if (!value || Object.keys(value).length === 0) return false;       // never started
    if (roundId === "giai-ma") return parseGiaiMaState(raw).stage === "ended";
    if (roundId === "but-pha") return parseButPhaState(raw).ended;
    if (roundId === "khoi-dong") return parseKhoiDongState(raw).ended;
    return true;
}

export async function liveRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof LiveConflictError) {
            reply.code(409).send({
                error: "CONFLICT",
                message: error.message,
                expectedVersion: error.expectedVersion,
                currentVersion: error.currentVersion,
            });
            return;
        }
        if (error instanceof RuleError) {
            reply.code(409).send({ error: error.code, message: error.message });
            return;
        }
        if (error instanceof LiveStateError) {
            reply.code(500).send({ error: "STATE_INVALID", message: error.message, details: error.details });
            return;
        }
        if (error instanceof LiveNotFoundError) {
            reply.code(404).send({ error: "NOT_FOUND", message: error.message });
            return;
        }
        reply.send(error);
    });

    // ── MC surface ────────────────────────────────────────────────────────────
    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId/live/actions",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: matchParams, body: actionBody },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string; seasonId: string; matchId: string;
            };
            const body = request.body as { expectedVersion: number; action: unknown };

            const scope = await requireMatchScope(tournamentId, seasonId);
            if (!canWriteTournament(scope.tournament, user)) {
                throw app.httpErrors.forbidden("Only the owner or an admin may drive a live match");
            }

            const match = await getMatch(seasonId, matchId);
            if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");

            if (!Value.Check(LiveActionSchema, body.action)) {
                throw app.httpErrors.badRequest("invalid live action");
            }
            const action = body.action as LiveAction;

            const ordered = orderedMatchRounds(scope.season.rounds, match.roundConfigs);

            const next = await applyLiveAction(
                pgLiveStore<Record<string, unknown>>(matchId),
                {
                    expectedVersion: body.expectedVersion,
                    transition: async (current, tx): Promise<Transition<Record<string, unknown>>> => {
                        if (action.kind === "round.advance") {
                            if (!isRoundEnded(current.roundId, current.state)) {
                                throw new RuleError("ROUND_NOT_ENDED", `round ${current.roundId} has not ended`);
                            }
                            const following = nextRoundId(ordered, current.roundId);
                            if (!following) {
                                throw new RuleError("NO_NEXT_ROUND", "no further round in this season");
                            }
                            return { state: {}, facts: [], roundId: following };
                        }

                        // An action must belong to the round that is active.
                        if (!action.kind.startsWith(`${current.roundId}.`)) {
                            throw new RuleError(
                                "WRONG_ROUND",
                                `action ${action.kind} does not belong to round ${current.roundId}`
                            );
                        }

                        if (current.roundId === "giai-ma") {
                            // Resolving reads the submitted answers INSIDE this transaction, so a
                            // submission that landed just before it cannot be missed.
                            let submittedAnswers: Record<string, boolean> = {};
                            if (action.kind === "giai-ma.resolveHint") {
                                const state = parseGiaiMaState(current.state);
                                if (state.openHint === null) {
                                    throw new RuleError("NO_OPEN_HINT", "no hint window is open");
                                }
                                submittedAnswers = await tx.readAnswers(state.openHint);
                            }

                            const ctx = giaiMaContext(app, match, action, current.roundId, user.id, submittedAnswers);
                            const engine = action.kind === "giai-ma.start"
                                ? EMPTY_GIAI_MA
                                : parseGiaiMaState(current.state);

                            const { state, facts } = applyGiaiMaAction(engine, action as GiaiMaAction, ctx);
                            return { state: state as unknown as Record<string, unknown>, facts };
                        }

                        if (current.roundId === "but-pha") {
                            const engine = action.kind === "but-pha.start"
                                ? EMPTY_BUT_PHA
                                : parseButPhaState(current.state);

                            const { state, facts } = applyButPhaAction(engine, action as ButPhaAction, {
                                actorId: user.id,
                                roundId: current.roundId,
                                now: new Date().toISOString(),
                                questionIds: roundQuestionIds(match, current.roundId)
                            });
                            return { state: state as unknown as Record<string, unknown>, facts };
                        }

                        if (current.roundId === "khoi-dong") {
                            const engine = action.kind === "khoi-dong.start"
                                ? EMPTY_KHOI_DONG
                                : parseKhoiDongState(current.state);

                            const { state, facts } = applyKhoiDongAction(engine, action as KhoiDongAction, {
                                ...khoiDongContext(match, current.roundId, user.id, new Date().toISOString())
                            });
                            return { state: state as unknown as Record<string, unknown>, facts };
                        }

                        throw new RuleError("WRONG_ROUND", `round ${current.roundId} has no controller actions yet`);
                    },
                }
            );

            return next;
        }
    );

    // Read the current state and version. The console calls this after a 409.
    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId/live",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: matchParams },
        },
        async (request) => {
            const { matchId } = request.params as { matchId: string };
            const live = await readLive(matchId);
            if (!live) throw app.httpErrors.notFound("no live round");
            return live;
        }
    );

    // ── Player surface ────────────────────────────────────────────────────────
    // A seated player submits a typed answer, only while the MC has its window open.
    // The answer is auto-matched and stored; it does not touch the round state, so it
    // never conflicts with the MC.
    app.post(
        "/gameplay/matches/:matchId/live/answers",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams, body: playerAnswerBody },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            const body = request.body as { questionId: string; value: unknown };

            if (!Value.Check(SubmittedAnswerValueSchema, body.value)) {
                throw app.httpErrors.badRequest("invalid answer value");
            }
            const value = body.value as SubmittedAnswerValue;

            const match = await getMatchById(matchId);
            if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");

            if (!isSeatedInMatch(match.players, user.id)) {
                throw app.httpErrors.forbidden("you are not a player in this match");
            }

            const live = await readLive(matchId);
            if (!live) throw app.httpErrors.notFound("no live round");

            // A round that the MC has not started has an empty state; say so plainly
            // rather than failing to parse it.
            if (!live.state || Object.keys(live.state).length === 0) {
                throw app.httpErrors.conflict(`round ${live.roundId} has not started`);
            }
            const now = new Date().toISOString();

            // ── giai-ma: answers are recorded, not scored; state does not change ──
            if (live.roundId === "giai-ma") {
                const state = parseGiaiMaState(live.state);

                if (state.openHint !== body.questionId) {
                    throw app.httpErrors.conflict("no answer window is open for this question");
                }
                if (!isWindowOpen(state, now)) {
                    throw app.httpErrors.conflict("the answer window has closed");
                }
                if (!canPlayerAnswer(state, user.id, now)) {
                    throw app.httpErrors.conflict("you can no longer answer this round");
                }

                const question = match.questions.find((c) => c._id === body.questionId);
                if (!question) throw app.httpErrors.badRequest("question is not part of this match");

                const correct = autoMatch(question.kind as QuestionKind, question.payload, value);
                await recordPlayerAnswer({
                    matchId,
                    questionId: body.questionId,
                    userId: user.id,
                    value,
                    verdict: correct ? "CORRECT" : "INCORRECT"
                });

                // Instant feedback is required mid-round for hints.
                return { correct };
            }

            // ── but-pha: the answer changes state (speed order, points) ──
            if (live.roundId === "but-pha") {
                if (!("text" in value)) {
                    throw app.httpErrors.badRequest("a but-pha answer must be text");
                }
                const state = parseButPhaState(live.state);

                const questionId = openQuestionId(state);
                if (questionId === null) throw app.httpErrors.conflict("no question is open");
                if (questionId !== body.questionId) {
                    throw app.httpErrors.conflict("that question is not open");
                }

                let atS: number;
                try {
                    atS = elapsedSeconds(state, now);
                } catch {
                    throw app.httpErrors.conflict("the question's clock has not started");
                }
                if (atS > QUESTION_LIMIT_S) {
                    throw app.httpErrors.conflict("the answer window has closed");
                }

                const question = match.questions.find((c) => c._id === questionId);
                if (!question) throw app.httpErrors.badRequest("question is not part of this match");

                const correct = autoMatch(question.kind as QuestionKind, question.payload, value);

                const next = await mutateLive(
                    pgLiveStore<Record<string, unknown>>(matchId),
                    (current): Transition<Record<string, unknown>> => {
                        const engine = parseButPhaState(current.state);
                        const { state: nextState, facts } = applyButPhaAction(
                            engine,
                            {
                                kind: "but-pha.submitAnswer",
                                playerId: user.id,
                                questionId,
                                correct,
                                text: value.text
                            },
                            {
                                actorId: user.id,
                                roundId: current.roundId,
                                now: new Date().toISOString(),
                                questionIds: []
                            }
                        );
                        return { state: nextState as unknown as Record<string, unknown>, facts };
                    }
                );

                const points = (parseButPhaState(next.state).points[questionId] ?? {})[user.id] ?? 0;
                return { correct, points };
            }

            // ── khoi-dong phase 2: typed, all players, one shared 60 s clock ──
            if (live.roundId === "khoi-dong") {
                if (!("text" in value)) {
                    throw app.httpErrors.badRequest("a khoi-dong phase-2 answer must be text");
                }
                const state = parseKhoiDongState(live.state);
                if (state.ended) throw app.httpErrors.conflict("the round has ended");
                if (state.stage !== "phase2" || state.phase2 === null) {
                    throw app.httpErrors.conflict("phase 2 is not open");
                }
                if (!state.phase2.questionIds.includes(body.questionId)) {
                    throw app.httpErrors.conflict("that question is not in phase 2");
                }

                let atS: number;
                try {
                    atS = elapsedPhase2Seconds(state, now);
                } catch {
                    throw app.httpErrors.conflict("phase 2's clock has not started");
                }
                if (atS > PHASE2_BUDGET_S) {
                    throw app.httpErrors.conflict("the answer window has closed");
                }

                const question = match.questions.find((c) => c._id === body.questionId);
                if (!question) throw app.httpErrors.badRequest("question is not part of this match");

                const correct = autoMatch(question.kind as QuestionKind, question.payload, value);

                await mutateLive(
                    pgLiveStore<Record<string, unknown>>(matchId),
                    (current): Transition<Record<string, unknown>> => {
                        const engine = parseKhoiDongState(current.state);
                        const { state: nextState, facts } = applyKhoiDongAction(
                            engine,
                            {
                                kind: "khoi-dong.recordTyped",
                                playerId: user.id,
                                questionId: body.questionId,
                                correct,
                                text: value.text,
                                atS
                            },
                            {
                                actorId: user.id,
                                roundId: current.roundId,
                                now: new Date().toISOString(),
                                playerIds: [],
                                phase1QuestionIds: [],
                                phase2QuestionIds: []
                            }
                        );
                        return { state: nextState as unknown as Record<string, unknown>, facts };
                    }
                );

                return { correct, points: correct ? 10 : 0 };
            }

            throw app.httpErrors.conflict(`round ${live.roundId} does not accept answers yet`);
        }
    );

    // A seated player submits their keyword. This DOES change the round state (the player
    // is locked), so it runs through mutateLive rather than a plain insert.
    app.post(
        "/gameplay/matches/:matchId/live/keyword",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams, body: playerAnswerBody },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            const body = request.body as { questionId: string; value: unknown };

            if (!Value.Check(SubmittedAnswerValueSchema, body.value)) {
                throw app.httpErrors.badRequest("invalid answer value");
            }
            const value = body.value as SubmittedAnswerValue;
            if (!("text" in value)) {
                throw app.httpErrors.badRequest("a keyword answer must be text");
            }

            const match = await getMatchById(matchId);
            if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");
            if (!isSeatedInMatch(match.players, user.id)) {
                throw app.httpErrors.forbidden("you are not a player in this match");
            }

            const live = await readLive(matchId);
            if (!live) throw app.httpErrors.notFound("no live round");
            if (live.roundId !== "giai-ma") {
                throw app.httpErrors.conflict(`round ${live.roundId} has no keyword submission`);
            }

            const keyword = match.questions.find(
                (q) => q.kind === "KEYWORD" && q.roundId === live.roundId
            );
            if (!keyword) throw app.httpErrors.badRequest("this round has no keyword question");
            if (keyword._id !== body.questionId) {
                throw app.httpErrors.badRequest("question is not this round's keyword");
            }

            const correct = autoMatch("KEYWORD", keyword.payload, value);

            const next = await mutateLive(
                pgLiveStore<Record<string, unknown>>(matchId),
                (current): Transition<Record<string, unknown>> => {
                    const state = parseGiaiMaState(current.state);
                    if (state.players.find((p) => p.id === user.id)?.keywordLocked) {
                        throw new RuleError("ALREADY_SUBMITTED", "you already submitted a keyword");
                    }
                    const { state: nextState, facts } = applyGiaiMaAction(
                        state,
                        {
                            kind: "giai-ma.submitKeyword",
                            playerId: user.id,
                            questionId: keyword._id,
                            correct,
                            text: value.text
                        },
                        {
                            actorId: user.id,
                            roundId: current.roundId,
                            hintTurnId: "",
                            submittedAnswers: {},
                            now: new Date().toISOString(),
                            keywordAutoMatched: true    // the player typed it; the server matched it
                        }
                    );
                    return { state: nextState as unknown as Record<string, unknown>, facts };
                }
            );

            return { correct, points: giaiMaPoints(parseGiaiMaState(next.state), user.id) };
        }
    );
}
