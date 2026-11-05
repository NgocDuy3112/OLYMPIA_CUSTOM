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

/** The desk's FIRST password again — typed, never generated, never audited. */
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

    // Enroll an account the PLAYER registered themselves (email + password of
    // their own choosing): the operator types the address, never the password.
    // 404 nobody registered it, 403 unverified, 409 already on the roster.
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

    // Edit a contestant: a typo in the name, or the address that lets their own
    // Google sign-in attach to this same row later (their history never moves).
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
                        // null (or "") detaches the address: a show-floor identity
                        email: { type: ["string", "null"], maxLength: 255 }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, userId } = request.params as { tournamentId: string; userId: string };
            const edit = request.body as { displayName?: string; email?: string | null };

            await assertWrite(tournamentId, user.id, user.role);
            const contestant = await updateContestant(tournamentId, userId, edit);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, contestantId: userId, displayName: contestant.displayName }
            });

            return contestant;
        }
    );

    // Make the identity a seat points at: a PLAYER with a display name, a handle
    // derived from it, and the FIRST PASSWORD the desk types. The player owns it
    // from their first sign-in (the server forces the change), so what the desk
    // holds is a password that stops being theirs — never one they keep.
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
                        // The desk's first password, typed for the player to
                        // change at their first sign-in. Never the player's own:
                        // they choose that themselves, one screen later.
                        password: { type: "string", minLength: 8, maxLength: 256 },
                        // Optional, and only ever "where Google sign-in will
                        // find this same row" — it is not the identity.
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

    // FORGOTTEN PASSWORD: the desk types a first password again, and the row
    // goes back to `mustChangePassword` — this one stops being the desk's at the
    // player's next sign-in too, and every session the old password minted dies
    // with the bump. The VALUE never leaves this request; it is not audited.
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

    // Off the roster. Refused once they have played, or while they still hold a
    // seat: the record of the show is not a typo to correct.
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
