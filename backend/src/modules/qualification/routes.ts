import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth } from "../../lib/guards.js";
import { auditFromRequest } from "../audit/service.js";
import { SubmittedAnswerValueSchema, type SubmittedAnswerValue } from "../../game/contracts/index.js";
import {
    matchParams,
    tournamentErrorHandler,
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import {
    advanceQualificationMatch,
    closeQualificationMatch,
    createQualificationMatch,
    getQualificationForPlayer,
    getQualificationForStaff,
    openQualificationMatch,
    submitQualificationAnswer
} from "./service.js";
import { getMatchById } from "../matches/service.js";
import { isSeatedInMatch } from "../matches/seats.js";
import { subscribe } from "../live/hub.js";
import { attachHeartbeat } from "../live/heartbeat.js";
import { attachSessionGuard } from "../live/session-guard.js";
import { isSessionActive } from "../live/store.js";
import { CLOSE_CODES, errorMessage } from "../live/protocol.js";

// The staff address a qualification match by tournament and match id.
const qualificationMatchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const idList = {
    type: "array",
    items: { type: "string", pattern: UUID_PATTERN },
    minItems: 1
} as const;

export async function qualificationRoutes(app: FastifyInstance) {
    tournamentErrorHandler(app);
    const { staff, assertWrite, assertView } = tournamentGuards();

    // ── The staff's side ───────────────────────────────────────────────────────

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
                body: {
                    type: "object",
                    required: ["label", "scheduledAt", "questionCount"],
                    additionalProperties: false,
                    properties: {
                        label: { type: "string", minLength: 1 },
                        scheduledAt: { type: "string", minLength: 1 },
                        stageId: { type: "string", minLength: 1 },
                        questionCount: { type: "integer", minimum: 1, maximum: 200 },
                        playerIds: idList
                    }
                }
            }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };
            const body = request.body as {
                label: string;
                scheduledAt: string;
                stageId?: string;
                questionCount: number;
                playerIds?: string[];
            };

            await assertWrite(tournamentId, user.id, user.role);
            const match = await createQualificationMatch(tournamentId, body);

            await auditFromRequest(request, "tournament_drawn", {
                details: { tournamentId, kind: "qualification", matchId: match.id }
            });

            reply.code(201);
            return match;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId",
        { onRequest: staff, schema: { params: qualificationMatchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertView(tournamentId, user.id, user.role);
            return getQualificationForStaff(matchId);
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId/close",
        {
            onRequest: staff,
            schema: {
                params: qualificationMatchParams,
                body: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        tieBreaks: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["players", "order"],
                                additionalProperties: false,
                                properties: { players: idList, order: idList }
                            }
                        }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
            const body = request.body as { tieBreaks?: Array<{ players: string[]; order: string[] }> } | undefined;

            await assertWrite(tournamentId, user.id, user.role);
            const result = await closeQualificationMatch(matchId, { tieBreaks: body?.tieBreaks });

            await auditFromRequest(request, "tournament_closed", {
                details: { kind: "qualification", tournamentId, matchId, order: result.rows }
            });

            return result;
        }
    );

    // ── The turns: open releases question 1, advance releases the next ────────
    //
    // Each returns the staff view, so the dialog is current after every click.
    // The service publishes to the players' sockets before we get here.

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId/open",
        { onRequest: staff, schema: { params: qualificationMatchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertWrite(tournamentId, user.id, user.role);
            const opened = await openQualificationMatch(matchId);

            await auditFromRequest(request, "match_opened", {
                details: { tournamentId, matchId, position: opened.currentPosition }
            });

            return getQualificationForStaff(matchId);
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId/advance",
        { onRequest: staff, schema: { params: qualificationMatchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertWrite(tournamentId, user.id, user.role);
            const advanced = await advanceQualificationMatch(matchId);

            await auditFromRequest(request, "match_advanced", {
                details: { tournamentId, matchId, position: advanced.currentPosition }
            });

            return getQualificationForStaff(matchId);
        }
    );

    // ── The player's side ──────────────────────────────────────────────────────

    app.get(
        "/gameplay/matches/:matchId/qualification",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchParams }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            return getQualificationForPlayer(matchId, user.id);
        }
    );

    app.post(
        "/gameplay/matches/:matchId/qualification/answers",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: {
                params: matchParams,
                body: {
                    type: "object",
                    required: ["questionId", "value"],
                    additionalProperties: false,
                    properties: {
                        questionId: { type: "string", pattern: UUID_PATTERN },
                        value: { type: "object" }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            const body = request.body as { questionId: string; value: unknown };

            if (!Value.Check(SubmittedAnswerValueSchema, body.value)) {
                throw app.httpErrors.badRequest("invalid answer value");
            }

            // The time is measured by the server. The client does not get a say in it.
            return submitQualificationAnswer({
                matchId,
                userId: user.id,
                questionId: body.questionId,
                value: body.value as SubmittedAnswerValue
            });
        }
    );

    // ── The turn channel ─────────────────────────────────────────────────────
    //
    // One server message: {type:"refresh"} — the client refetches the GET, whose
    // response is the single source of truth. On connect we send {type:"sync"}
    // AFTER subscribing, so a release in the gap between a failed GET and this
    // subscription can never be missed (subscribe → read → send).
    // No client commands: the protocol has nothing a player may send.
    app.get(
        "/gameplay/matches/:matchId/qualification/stream",
        {
            websocket: true,
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchParams }
        },
        async (socket, request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };

            const match = await getMatchById(matchId);
            if (match.kind !== "QUALIFICATION") {
                socket.send(JSON.stringify(errorMessage("UNAVAILABLE", "not a mass event")));
                socket.close(1000, "not a mass event");
                return;
            }
            // A seated player only — the same line the live stream draws.
            if (!isSeatedInMatch(match.players, user.id)) {
                socket.close(CLOSE_CODES.NOT_SEATED, "not a player in this match");
                return;
            }

            const push = async () => {
                try { socket.send(JSON.stringify({ type: "refresh" })); } catch { /* gone */ }
            };

            // Synchronous stretch: subscribe, heartbeat, guard, listeners — then the
            // awaits. A socket closing during the awaits still reaches cleanup.
            const unsubscribe = subscribe(matchId, { userId: user.id, push });
            const stopHeartbeat = attachHeartbeat(socket);

            let stopSessionGuard: () => void = () => {};
            const cleanup = () => {
                stopHeartbeat();
                stopSessionGuard();
                unsubscribe();
            };
            socket.on("close", cleanup);
            socket.on("error", cleanup);

            const connectedAtVersion = user.tokenVersion;
            stopSessionGuard = attachSessionGuard({
                check: () => isSessionActive(user.id, connectedAtVersion),
                onInvalid: () => {
                    cleanup();
                    try { socket.close(CLOSE_CODES.SESSION_ENDED, "session ended"); } catch { /* already gone */ }
                }
            });

            try {
                const snapshot = await getMatchById(matchId);
                socket.send(JSON.stringify({
                    type: "sync",
                    open: snapshot.currentPosition !== null && snapshot.status !== "FINISHED",
                    closed: snapshot.status === "FINISHED",
                    currentPosition: snapshot.currentPosition
                }));
            } catch {
                cleanup();
                try { socket.close(); } catch { /* already gone */ }
            }
        }
    );
}
