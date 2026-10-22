import type { FastifyInstance } from "fastify";
import { auditFromRequest } from "../audit/service.js";
import { tournamentErrorHandler, tournamentGuards, tournamentParams } from "../tournament-shared.js";
import { getStandings, recomputeStandings } from "./service.js";

export async function standingsRoutes(app: FastifyInstance) {
    tournamentErrorHandler(app);
    const { staff, assertWrite, assertView } = tournamentGuards();

    app.get(
        "/portal/tournaments/:tournamentId/standings",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            await assertView(tournamentId, user.id, user.role);
            return { rows: await getStandings(tournamentId) };
        }
    );

    // The table is recomputed whenever a match ends; this is the manual way to redo it.
    app.post(
        "/portal/tournaments/:tournamentId/standings/recompute",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            await assertWrite(tournamentId, user.id, user.role);
            const rows = await recomputeStandings(tournamentId);

            await auditFromRequest(request, "tournament_updated", {
                details: { tournamentId, standings: rows.length }
            });

            return { rows };
        }
    );
}
