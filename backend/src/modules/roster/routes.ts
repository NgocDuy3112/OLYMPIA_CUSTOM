import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import {
    matchParams,
    tournamentErrorHandler,
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import {
    assignGroup,
    createContestant,
    enrollByEmail,
    enrollPlayers,
    listEnrolled,
    removeContestant,
    resetPassword,
    updateContestant,
    type GroupLabel
} from "./service.js";

const playerParams = {
    type: "object",
    required: ["tournamentId", "userId"],
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        userId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const passwordBody = {
    type: "object",
    required: ["password"],
    additionalProperties: false,
    properties: {
        password: { type: "string", minLength: 8, maxLength: 256 }
    }
} as const;

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

    app.post(
        "/portal/tournaments/:tournamentId/players/by-email",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
                body: {
                    type: "object",
                    required: ["email"],
                    additionalProperties: false,
                    properties: {
                        email: { type: "string", maxLength: 255 }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };
            const { email } = request.body as { email: string };

            await assertWrite(tournamentId, user.id, user.role);
            const enrolled = await enrollByEmail(tournamentId, email);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, enrolled: enrolled.userId, byEmail: enrolled.email }
            });

            return enrolled;
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/players/:userId",
        {
            onRequest: staff,
            schema: {
                params: playerParams,
                body: {
                    type: "object",
                    additionalProperties: false,
                    minProperties: 1,
                    properties: {
                        displayName: { type: "string", minLength: 1, maxLength: 100 },
                        email: { type: ["string", "null"], maxLength: 255 },
                        discordId: { type: ["string", "null"], pattern: "^[0-9]{15,30}$" }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, userId } = request.params as { tournamentId: string; userId: string };
            const edit = request.body as { displayName?: string; email?: string | null; discordId?: string | null };

            await assertWrite(tournamentId, user.id, user.role);
            const contestant = await updateContestant(tournamentId, userId, edit);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, contestantId: userId, displayName: contestant.displayName }
            });

            return contestant;
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/players/new",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
                body: {
                    type: "object",
                    required: ["displayName", "password"],
                    additionalProperties: false,
                    properties: {
                        displayName: { type: "string", minLength: 1, maxLength: 100 },
                        password: { type: "string", minLength: 8, maxLength: 256 },
                        email: { type: "string", maxLength: 255 }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };
            const { displayName, password, email } = request.body as {
                displayName: string;
                password: string;
                email?: string;
            };

            await assertWrite(tournamentId, user.id, user.role);
            const contestant = await createContestant(tournamentId, { displayName, password, email });

            await auditFromRequest(request, "tournament_updated", {
                details: {
                    tournamentId,
                    contestantId: contestant.userId,
                    displayName: contestant.displayName,
                    username: contestant.username
                }
            });

            return contestant;
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/players/:userId/password",
        { onRequest: staff, schema: { params: playerParams, body: passwordBody } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, userId } = request.params as { tournamentId: string; userId: string };
            const { password } = request.body as { password: string };

            await assertWrite(tournamentId, user.id, user.role);
            const reset = await resetPassword(tournamentId, userId, password);

            await auditFromRequest(request, "tournament_updated", {
                targetId: userId,
                details: { tournamentId, passwordResetFor: userId }
            });

            return reset;
        }
    );

    app.delete(
        "/portal/tournaments/:tournamentId/players/:userId",
        { onRequest: staff, schema: { params: playerParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, userId } = request.params as { tournamentId: string; userId: string };

            await assertWrite(tournamentId, user.id, user.role);
            await removeContestant(tournamentId, userId);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, removedContestant: userId }
            });

            return { removed: userId };
        }
    );

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
