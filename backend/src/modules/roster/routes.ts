import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import {
    matchParams,
    tournamentErrorHandler,
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import { assignGroup, createContestant, enrollPlayers, listEnrolled, type GroupLabel } from "./service.js";

export async function rosterRoutes(app: FastifyInstance) {
    tournamentErrorHandler(app);
    const { staff, assertWrite, assertView } = tournamentGuards();

    app.post(
        "/portal/tournaments/:tournamentId/players",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
                body: {
                    type: "object",
                    required: ["userIds"],
                    additionalProperties: false,
                    properties: {
                        userIds: {
                            type: "array",
                            items: { type: "string", pattern: UUID_PATTERN },
                            minItems: 1
                        }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };
            const { userIds } = request.body as { userIds: string[] };

            await assertWrite(tournamentId, user.id, user.role);
            const enrolled = await enrollPlayers(tournamentId, userIds);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, enrolled }
            });

            return { enrolled };
        }
    );

    // Make the identity a seat points at: a PLAYER with a display name, enrolled
    // in the same call. Players never sign in (no password, no Google) — the PIN
    // claim mints their session — so this is the only way onto a roster.
    app.post(
        "/portal/tournaments/:tournamentId/players/new",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
                body: {
                    type: "object",
                    required: ["displayName"],
                    additionalProperties: false,
                    properties: {
                        displayName: { type: "string", minLength: 1, maxLength: 100 },
                        // Optional: with an address the player's own Google sign-in
                        // attaches to this row later, keeping their history.
                        email: { type: "string", maxLength: 255 }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };
            const { displayName, email } = request.body as { displayName: string; email?: string };

            await assertWrite(tournamentId, user.id, user.role);
            const contestant = await createContestant(tournamentId, displayName, email);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, contestantId: contestant.userId, displayName: contestant.displayName }
            });

            return contestant;
        }
    );

    // The DRAW: place an enrolled contestant in Nhóm A / Nhóm B (or clear it).
    // The group tables are derived from this, so it is the only group write.
    app.patch(
        "/portal/tournaments/:tournamentId/players/:userId/group",
        {
            onRequest: staff,
            schema: {
                params: {
                    type: "object",
                    required: ["tournamentId", "userId"],
                    properties: {
                        tournamentId: { type: "string", pattern: UUID_PATTERN },
                        userId: { type: "string", pattern: UUID_PATTERN }
                    }
                },
                body: {
                    type: "object",
                    required: ["group"],
                    additionalProperties: false,
                    properties: {
                        group: { type: ["string", "null"], enum: ["A", "B", null] }
                    }
                }
            }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, userId } = request.params as { tournamentId: string; userId: string };
            const { group } = request.body as { group: GroupLabel | null };

            await assertWrite(tournamentId, user.id, user.role);
            const placed = await assignGroup(tournamentId, userId, group);
            if (!placed) {
                return reply.code(404).send({ code: "NOT_ENROLLED", message: "this player is not enrolled in the tournament" });
            }

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, userId, group }
            });

            return { userId, group };
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/players",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            await assertView(tournamentId, user.id, user.role);
            return { items: await listEnrolled(tournamentId) };
        }
    );
}
