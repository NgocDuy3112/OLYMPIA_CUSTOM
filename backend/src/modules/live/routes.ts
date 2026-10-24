import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth, requireRole } from "../../lib/guards.js";
import { getMatch, getMatchById, requireMatchScope, type MatchRow } from "../matches/service.js";
import { namesOf } from "../standings/service.js";
import { nextRoundId, orderedMatchRounds } from "../matches/rounds.js";
import { isSeatedInMatch } from "../matches/seats.js";
import { auditFromRequest } from "../audit/service.js";
import { canWriteTournament } from "../../lib/tournament-access.js";
import { applyLiveAction, mutateLive, type AnswerDraft, type Transition } from "./apply.js";
import { LiveConflictError } from "./conflict.js";
import { isSessionActive, readLive, readPlayerAnswers, readQuestionAnswers, sumPointsByPlayer, LiveNotFoundError, pgLiveStore } from "./store.js";
import { RuleError } from "../../game/engine/turns/errors.js";
import { VeDichRuleError } from "../../game/engine/turns/ve-dich.js";
import { LiveActionSchema, type ButPhaAction, type GiaiMaAction, type KhoiDongAction, type LiveAction, type VeDichAction } from "./actions.js";
import { applyGiaiMaAction, type GiaiMaContext } from "./giai-ma.js";
import { applyButPhaAction } from "./but-pha.js";
import { applyKhoiDongAction } from "./khoi-dong.js";
import { applyVeDichAction } from "./ve-dich.js";
import { buildPlayerView, rankTable, type PlayerView, type ScoreRow } from "./view.js";
import { submitAnswer, submitKeyword, SubmitError } from "./submit.js";
import { submitVeDichCommand } from "./ve-dich-player.js";
import {
    ackMessage,
    CLOSE_CODES,
    ClientMessageSchema,
    errorMessage,
    requestIdOf,
    viewMessage,
    type ClientMessage,
    type ServerMessage
} from "./protocol.js";
import { publish, subscribe } from "./hub.js";
import { attachHeartbeat } from "./heartbeat.js";
import { attachSessionGuard } from "./session-guard.js";
import { LiveStateError, parseButPhaState, parseGiaiMaState, parseKhoiDongState, parseRoundState, parseVeDichState } from "./state.js";
import { remainingHints, startGiaiMa, type GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import {
    butPhaRules,
    giaiMaRules,
    khoiDongRules,
    veDichRules
} from "../../game/engine/rules.js";
import { openQuestionId, type ButPhaState } from "../../game/engine/turns/but-pha.js";
import { type KhoiDongState } from "../../game/engine/turns/khoi-dong-round.js";
import type { VeDichState } from "../../game/engine/turns/ve-dich.js";
import { type MatchQuestion, type RoundConfig } from "../../game/contracts/index.js";
import {
    BUT_PHA_DEFAULTS,
    GIAI_MA_DEFAULTS,
    KHOI_DONG_DEFAULTS,
    VE_DICH_DEFAULTS
} from "../../game/engine/rules.js";

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

// giai-ma.start replaces the state wholesale, so the incoming state is irrelevant.
const EMPTY_GIAI_MA: GiaiMaState = startGiaiMa([], [], GIAI_MA_DEFAULTS);

// khoi-dong.start replaces the state wholesale; this placeholder only satisfies the types.
const EMPTY_VE_DICH: VeDichState = {
    rules: VE_DICH_DEFAULTS,
    phase: 1, players: [], remaining: [], turnIndex: 0, pendingPicks: [],
    open: null, buzzOpenedAt: null, ended: false
};

const EMPTY_KHOI_DONG: KhoiDongState = {
    rules: KHOI_DONG_DEFAULTS,
    stage: "phase1", ended: false, order: [], activeIndex: 0, runs: {}, phase2: null, phase2OpenedAt: null
};

// but-pha.start replaces the state wholesale; this placeholder only satisfies the types.
const EMPTY_BUT_PHA: ButPhaState = {
    rules: BUT_PHA_DEFAULTS,
    questionIds: [], cursor: 0, questionOpenedAt: null, answers: {}, points: {}, ended: false
};

// The rulebook's rules for a round, from the match's config. The format's defaults
// apply wherever the rulebook is silent.
function rulesFor(match: { roundConfigs: Record<string, RoundConfig> }, roundId: string) {
    const config = match.roundConfigs[roundId];
    switch (roundId) {
        case "khoi-dong": return khoiDongRules(config);
        case "giai-ma": return giaiMaRules(config);
        case "but-pha": return butPhaRules(config);
        case "ve-dich": return veDichRules(config);
        default: return undefined;
    }
}

// khoi-dong runs two turns: phase 1 (oral) then phase 2 (typed). The turn order comes from
// the match's round config, so the split is server-authoritative, not client-chosen.
function khoiDongContext(
    match: { questions: MatchQuestion[]; roundConfigs: Record<string, RoundConfig>; players: unknown },
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
        rules: khoiDongRules(match.roundConfigs[roundId] as RoundConfig | undefined),
        playerIds: (match.players as Array<{ kind: string; userId?: string }>)
            .filter((seat) => seat.kind === "user")
            .map((seat) => seat.userId!),
        phase1QuestionIds: idsForTurn(turns[0]?.id),
        phase2QuestionIds: idsForTurn(turns[1]?.id)
    };
}

// The 24 ve-dich questions: value from the question's points, domain from its tag.
function veDichQuestions(match: { questions: MatchQuestion[] }) {
    return match.questions
        .filter((q) => q.roundId === "ve-dich")
        .sort((a, b) => a.position - b.position)
        .map((q) => ({ id: q._id, domain: q.tag, value: q.points }));
}

// The match's questions for a round, in position order. Resolved server-side, so a client
// never chooses which questions a round plays.
function roundQuestionIds(match: { questions: MatchQuestion[] }, roundId: string): string[] {
    return match.questions
        .filter((q) => q.roundId === roundId)
        .sort((a, b) => a.position - b.position)
        .map((q) => q._id);
}

// The live scoreboard: every seated player's match total with the name to show it
// by. Totals come from the answers ledger (the facts each action commits); the view
// only ranks them.
async function scoreTable(match: MatchRow): Promise<ScoreRow[]> {
    const userIds = match.players.flatMap((seat) =>
        seat.kind === "user" && seat.userId ? [seat.userId] : []);
    const [sums, names] = await Promise.all([
        sumPointsByPlayer(match.id),
        namesOf(userIds)
    ]);
    return userIds.map((id) => ({ id, displayName: names[id] ?? id, points: sums[id] ?? 0 }));
}

const matchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
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

// A ve-dich player command. The command `type` picks which fields apply.
const playerCommandBody = {
    type: "object",
    required: ["type"],
    additionalProperties: false,
    properties: {
        type: { type: "string", enum: ["pick", "pickBatch", "power", "buzz"] },
        questionId: { type: "string", pattern: UUID_PATTERN },
        questionIds: {
            type: "array",
            items: { type: "string", pattern: UUID_PATTERN },
            minItems: 3,
            maxItems: 3
        },
        power: { type: "string", enum: ["HOPE", "SHIELD"] }
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
        rules: giaiMaRules((match as { roundConfigs?: Record<string, RoundConfig> }).roundConfigs?.[roundId]),
        keywordAutoMatched: false           // the MC asserted the verdict
    };
}

function isRoundEnded(roundId: string, raw: unknown): boolean {
    const value = raw as Record<string, unknown> | null;
    if (!value || Object.keys(value).length === 0) return false;       // never started
    if (roundId === "giai-ma") return parseGiaiMaState(raw).stage === "ended";
    if (roundId === "but-pha") return parseButPhaState(raw).ended;
    if (roundId === "khoi-dong") return parseKhoiDongState(raw).ended;
    if (roundId === "ve-dich") return parseVeDichState(raw).ended;
    return true;
}

// What only the controller needs beyond the shared projection — engine facts,
// read through the engine's own parsers (never raw-shape guesses on a client).
// null = the round has not started; {} = nothing extra for this round.
function mcFacts(roundId: string, raw: unknown): Record<string, unknown> | null {
    const value = raw as Record<string, unknown> | null;
    if (!value || Object.keys(value).length === 0) return null;

    if (roundId === "giai-ma") {
        const state = parseGiaiMaState(raw);
        return {
            hintsRemaining: remainingHints(state),
            hintsPicked: state.picked,
            openHintId: state.openHint,
            players: state.players.map((p) => ({
                id: p.id,
                keywordLocked: p.keywordLocked,
                eliminated: p.eliminated
            }))
        };
    }
    if (roundId === "ve-dich") {
        const state = parseVeDichState(raw);
        return {
            phase: state.phase,
            turnPlayerId: state.players[state.turnIndex]?.id ?? null,
            openStage: state.open?.stage ?? null,
            answererId: state.open?.answerer ?? null,
            buzzerId: state.open?.buzzer ?? null,
            power: state.open?.power ?? null,
            pendingQuestionId: state.pendingPicks[0]?.id ?? null
        };
    }
    if (roundId === "khoi-dong") {
        const state = parseKhoiDongState(raw);
        return {
            phase2Begun: state.phase2 !== null,
            phase2Closed: state.phase2?.closed ?? false
        };
    }
    return {};  // but-pha: the shared projection (stage/open/deadlines) says it all
}

export async function liveRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof SubmitError) {
            reply.code(error.status).send({ error: error.code, message: error.message });
            return;
        }
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
        // ve-dich's engine predates the shared RuleError and carries its code in `detail`.
        if (error instanceof VeDichRuleError) {
            reply.code(409).send({ error: error.detail.code, message: error.message });
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
        "/portal/tournaments/:tournamentId/matches/:matchId/live/actions",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: matchParams, body: actionBody },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as {
                tournamentId: string; matchId: string;
            };
            const body = request.body as { expectedVersion: number; action: unknown };

            const scope = await requireMatchScope(tournamentId);
            if (!canWriteTournament(scope.tournament, user)) {
                throw app.httpErrors.forbidden("Only the owner or an admin may drive a live match");
            }

            const match = await getMatch(tournamentId, matchId);
            if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");

            if (!Value.Check(LiveActionSchema, body.action)) {
                throw app.httpErrors.badRequest("invalid live action");
            }
            const action = body.action as LiveAction;

            const ordered = orderedMatchRounds(scope.tournament.rounds, match.roundConfigs);

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
                                throw new RuleError("NO_NEXT_ROUND", "no further round in this tournament");
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

                            // Finalizing reads the drafts (and their times) inside this tx.
                            let answerDrafts: AnswerDraft[] = [];
                            if (action.kind === "but-pha.finalize") {
                                answerDrafts = await tx.readAnswerDrafts(action.questionId);
                            }

                            // Strict blocking: the next question requires every answer of the
                            // current one to have a final verdict.
                            if (action.kind === "but-pha.closeQuestion") {
                                const open = openQuestionId(engine);
                                if (open !== null) {
                                    const drafts = await tx.readAnswerDrafts(open);
                                    if (drafts.some((d) => !d.judged)) {
                                        throw new RuleError(
                                            "UNJUDGED_ANSWERS",
                                            "judge every submitted answer before closing the question"
                                        );
                                    }
                                }
                            }

                            const { state, facts } = applyButPhaAction(engine, action as ButPhaAction, {
                                actorId: user.id,
                                roundId: current.roundId,
                                now: new Date().toISOString(),
                                rules: butPhaRules(match.roundConfigs[current.roundId] as RoundConfig | undefined),
                                questionIds: roundQuestionIds(match, current.roundId),
                                answerDrafts
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

                        if (current.roundId === "ve-dich") {
                            const engine = action.kind === "ve-dich.start"
                                ? EMPTY_VE_DICH
                                : parseVeDichState(current.state);

                            // Resolving phase 1 finalizes the answerer's draft, so the engine
                            // needs to know whether one exists.
                            let drafts: AnswerDraft[] = [];
                            if (action.kind === "ve-dich.resolve" && engine.open !== null) {
                                drafts = await tx.readAnswerDrafts(engine.open.question.id);
                            }

                            // ve-dich orders phase 1 by score, so the seed is the cumulative
                            // match score — everyone starts ve-dich itself at zero.
                            const sums = action.kind === "ve-dich.start"
                                ? await sumPointsByPlayer(matchId)
                                : {};

                            const { state, facts } = applyVeDichAction(engine, action as VeDichAction, {
                                actorId: user.id,
                                roundId: current.roundId,
                                now: new Date().toISOString(),
                                rules: veDichRules(match.roundConfigs[current.roundId] as RoundConfig | undefined),
                                questions: veDichQuestions(match),
                                players: (match.players as Array<{ kind: string; userId?: string }>)
                                    .filter((seat) => seat.kind === "user")
                                    .map((seat) => ({ id: seat.userId!, score: sums[seat.userId!] ?? 0 })),
                                drafts
                            });
                            return { state: state as unknown as Record<string, unknown>, facts };
                        }

                        throw new RuleError("WRONG_ROUND", `round ${current.roundId} has no controller actions yet`);
                    },
                }
            );

            // Tell every connected player their view is stale.
            await publish(matchId);

            if (action.kind === "khoi-dong.finalize") {
                await auditFromRequest(request, "answer_judged", {
                    matchId,
                    details: {
                        roundId: next.roundId,
                        questionId: action.questionId,
                        verdicts: action.verdicts
                    }
                });
            }

            return next;
        }
    );

    // The answers for a question, with their drafts, so the controller can judge them.
    app.get(
        "/portal/tournaments/:tournamentId/matches/:matchId/live/answers",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: {
                params: matchParams,
                querystring: {
                    type: "object",
                    required: ["questionId"],
                    additionalProperties: false,
                    properties: { questionId: { type: "string", pattern: UUID_PATTERN } }
                }
            },
        },
        async (request) => {
            const { matchId } = request.params as { matchId: string };
            const { questionId } = request.query as { questionId: string };
            return { items: await readQuestionAnswers(matchId, questionId) };
        }
    );

    // Read the current state and version. The console calls this after a 409.
    app.get(
        "/portal/tournaments/:tournamentId/matches/:matchId/live",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: matchParams },
        },
        async (request) => {
            const { matchId } = request.params as { matchId: string };
            const live = await readLive(matchId);
            if (!live) throw app.httpErrors.notFound("no live round");

            const match = await getMatchById(matchId);
            const table = await scoreTable(match);
            const started = live.state !== null && Object.keys(live.state).length > 0;

            // The shared projection: what console and players both see — stage, open
            // questions with payloads, the oral run, the board, the table. The
            // observer's `me` is discarded: the console is not a player.
            const view: PlayerView = started
                ? buildPlayerView({
                      matchId,
                      roundId: live.roundId,
                      version: live.version,
                      now: new Date().toISOString(),
                      userId: "",
                      state: parseRoundState(live.roundId, live.state),
                      submitted: [],
                      questions: match.questions,
                      table
                  })
                : {
                      matchId,
                      roundId: live.roundId,
                      version: live.version,
                      stage: "pending",
                      open: [],
                      table: rankTable(table),
                      me: {}
                  };
            const { me: _observer, ...projection } = view;

            return {
                ...live,
                // The judge's view: the full frozen set, answers included.
                questions: match.questions,
                projection,
                roundEnded: isRoundEnded(live.roundId, live.state),
                mc: mcFacts(live.roundId, live.state)
            };
        }
    );

    // ── Player surface ────────────────────────────────────────────────────────

    // The realtime channel: the same view as the GET, pushed whenever the round changes.
    app.get(
        "/gameplay/matches/:matchId/live/stream",
        {
            websocket: true,
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams },
        },
        async (socket, request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };

            const send = async () => {
                const match = await getMatchById(matchId);
                const live = await readLive(matchId);
                if (match.status !== "LIVE" || !live) {
                    socket.send(JSON.stringify(errorMessage("UNAVAILABLE", "the match is not live")));
                    return;
                }

                const state = live.state && Object.keys(live.state).length > 0
                    ? parseRoundState(live.roundId, live.state)
                    : null;

                const table = await scoreTable(match);
                const view: PlayerView = state === null
                    ? { matchId, roundId: live.roundId, version: live.version, stage: "pending", open: [], table: rankTable(table), me: {} }
                    : buildPlayerView({
                          matchId,
                          roundId: live.roundId,
                          version: live.version,
                          now: new Date().toISOString(),
                          userId: user.id,
                          state,
                          submitted: await readPlayerAnswers(matchId, user.id),
                          questions: match.questions,
                          table
                      });

                socket.send(JSON.stringify(viewMessage(view)));
            };

            // A seated player only.
            const match = await getMatchById(matchId);
            if (!isSeatedInMatch(match.players, user.id)) {
                socket.close(CLOSE_CODES.NOT_SEATED, "not a player in this match");
                return;
            }

            // A half-open socket would otherwise sit in the hub forever, receiving pushes.
            const stopHeartbeat = attachHeartbeat(socket);
            const unsubscribe = subscribe(matchId, { userId: user.id, push: send });

            // A socket outlives the request that opened it, so re-check the session
            // (disabled account, revoked tokenVersion) the way HTTP does on every request.
            let stopSessionGuard: () => void = () => {};
            // Every exit path frees the heartbeat, the guard, and the hub entry.
            const cleanup = () => {
                stopHeartbeat();
                stopSessionGuard();
                unsubscribe();
            };

            const connectedAtVersion = user.tokenVersion;
            stopSessionGuard = attachSessionGuard({
                check: () => isSessionActive(user.id, connectedAtVersion),
                onInvalid: () => {
                    cleanup();
                    try { socket.close(CLOSE_CODES.SESSION_ENDED, "session ended"); } catch { /* already closed */ }
                }
            });
            socket.on("close", cleanup);
            socket.on("error", cleanup);

            // Inbound: one validated envelope per command.
            socket.on("message", async (raw) => {
                const reply = (message: ServerMessage) => {
                    try { socket.send(JSON.stringify(message)); } catch { /* socket gone */ }
                };

                let parsed: unknown;
                try {
                    parsed = JSON.parse(String(raw));
                } catch {
                    reply(errorMessage("BAD_MESSAGE", "invalid JSON"));
                    return;
                }

                if (!Value.Check(ClientMessageSchema, parsed)) {
                    reply(errorMessage("BAD_MESSAGE", "unknown or malformed message", requestIdOf(parsed)));
                    return;
                }

                const message = parsed as ClientMessage;
                const base = {
                    matchId,
                    userId: user.id,
                    ip: request.ip,
                    userAgent: request.headers["user-agent"] ?? null
                };

                try {
                    switch (message.type) {
                        case "answer":
                            reply(ackMessage("answer", await submitAnswer({
                                ...base, questionId: message.data.questionId, value: message.data.value
                            }), message.requestId));
                            break;
                        case "keyword":
                            reply(ackMessage("keyword", await submitKeyword({
                                ...base, questionId: message.data.questionId, value: message.data.value
                            }), message.requestId));
                            break;
                        case "pick":
                            reply(ackMessage("pick", await submitVeDichCommand({
                                ...base, command: { type: "pick", questionId: message.data.questionId }
                            }), message.requestId));
                            break;
                        case "pickBatch":
                            reply(ackMessage("pickBatch", await submitVeDichCommand({
                                ...base, command: { type: "pickBatch", questionIds: message.data.questionIds }
                            }), message.requestId));
                            break;
                        case "power":
                            reply(ackMessage("power", await submitVeDichCommand({
                                ...base, command: { type: "power", power: message.data.power }
                            }), message.requestId));
                            break;
                        case "buzz":
                            reply(ackMessage("buzz", await submitVeDichCommand({
                                ...base, command: { type: "buzz", questionId: message.data.questionId }
                            }), message.requestId));
                            break;
                    }
                } catch (error) {
                    if (error instanceof SubmitError) {
                        reply(errorMessage(error.code, error.message, message.requestId));
                    } else if (error instanceof VeDichRuleError) {
                        reply(errorMessage(error.detail.code, error.message, message.requestId));
                    } else {
                        reply(errorMessage("INTERNAL", "something went wrong", message.requestId));
                    }
                }
            });

            try {
                await send();
            } catch {
                cleanup();
                try { socket.terminate(); } catch { /* already closed */ }
            }
        }
    );

    // What this player should see: the shared flow plus their own private state.
    app.get(
        "/gameplay/matches/:matchId/live",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };

            const match = await getMatchById(matchId);
            if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");
            if (!isSeatedInMatch(match.players, user.id)) {
                throw app.httpErrors.forbidden("you are not a player in this match");
            }

            const live = await readLive(matchId);
            if (!live) throw app.httpErrors.notFound("no live round");

            const table = await scoreTable(match);

            // A round the MC has not started yet has an empty state; say so plainly.
            if (!live.state || Object.keys(live.state).length === 0) {
                return {
                    matchId,
                    roundId: live.roundId,
                    version: live.version,
                    stage: "pending",
                    open: [],
                    table: rankTable(table),
                    me: {}
                };
            }

            return buildPlayerView({
                matchId,
                roundId: live.roundId,
                version: live.version,
                now: new Date().toISOString(),
                userId: user.id,
                state: parseRoundState(live.roundId, live.state),
                submitted: await readPlayerAnswers(matchId, user.id),
                questions: match.questions,
                table
            });
        }
    );

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
            return submitAnswer({
                matchId,
                userId: user.id,
                questionId: body.questionId,
                value: body.value,
                ip: request.ip,
                userAgent: request.headers["user-agent"] ?? null
            });
        }
    );

    // A seated player's ve-dich command, over HTTP (the socket carries the same commands).
    app.post(
        "/gameplay/matches/:matchId/live/commands",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams, body: playerCommandBody },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            const body = request.body as {
                type: string;
                questionId?: string;
                questionIds?: string[];
                power?: "HOPE" | "SHIELD";
            };

            const base = {
                matchId,
                userId: user.id,
                ip: request.ip,
                userAgent: request.headers["user-agent"] ?? null
            };

            if (body.type === "pick" || body.type === "buzz") {
                if (!body.questionId) throw app.httpErrors.badRequest("questionId is required");
                return submitVeDichCommand({ ...base, command: { type: body.type, questionId: body.questionId } });
            }
            if (body.type === "pickBatch") {
                if (!body.questionIds || body.questionIds.length !== 3) {
                    throw app.httpErrors.badRequest("questionIds must contain exactly 3 ids");
                }
                return submitVeDichCommand({ ...base, command: { type: "pickBatch", questionIds: body.questionIds } });
            }
            if (body.type === "power") {
                if (body.power !== "HOPE" && body.power !== "SHIELD") {
                    throw app.httpErrors.badRequest("power must be HOPE or SHIELD");
                }
                return submitVeDichCommand({ ...base, command: { type: "power", power: body.power } });
            }

            throw app.httpErrors.badRequest("unknown command");
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
            return submitKeyword({
                matchId,
                userId: user.id,
                questionId: body.questionId,
                value: body.value,
                ip: request.ip,
                userAgent: request.headers["user-agent"] ?? null
            });
        }
    );
}
