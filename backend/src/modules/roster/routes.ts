import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import {
    matchParams,
    seasonErrorHandler,
    seasonGuards,
    seasonParams,
    UUID_PATTERN
} from "../season-shared.js";
import { enrollPlayers, listEnrolled } from "./service.js";

export async function rosterRoutes(app: FastifyInstance) {
    seasonErrorHandler(app);
    const { staff, assertWrite, assertView } = seasonGuards();

    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/players",
        {
            onRequest: staff,
            schema: {
                params: seasonParams,
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
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            const { userIds } = request.body as { userIds: string[] };

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const enrolled = await enrollPlayers(seasonId, userIds);

            await auditFromRequest(request, "season_updated", {
                details: { seasonId, enrolled }
            });

            return { enrolled };
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/players",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };

            await assertView(tournamentId, seasonId, user.id, user.role);
            return { items: await listEnrolled(seasonId) };
        }
    );
}
