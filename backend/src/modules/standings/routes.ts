import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import { seasonErrorHandler, seasonGuards, seasonParams } from "../season-shared.js";
import { getStandings, recomputeStandings } from "./service.js";

export async function standingsRoutes(app: FastifyInstance) {
    seasonErrorHandler(app);
    const { staff, assertWrite, assertView } = seasonGuards();

    app.get(
        "/portal/seasons/:seasonId/standings",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            await assertView(seasonId, user.id, user.role);
            return { rows: await getStandings(seasonId) };
        }
    );

    // The table is recomputed whenever a match ends; this is the manual way to redo it.
    app.post(
        "/portal/seasons/:seasonId/standings/recompute",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            await assertWrite(seasonId, user.id, user.role);
            const rows = await recomputeStandings(seasonId);

            await auditFromRequest(request, "season_updated", {
                details: { seasonId, standings: rows.length }
            });

            return { rows };
        }
    );
}
