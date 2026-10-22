import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import {
    matchParams,
    tournamentErrorHandler,
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import { enrollPlayers, listEnrolled } from "./service.js";

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
