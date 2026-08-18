import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, records } from "@oc/db";
import { resolveMatchId } from "../../state/id-cache.js";

export async function recordRoutes(app: FastifyInstance) {
  // GET /records/:matchCode — list score records for a match
  app.get("/records/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const { questionCode } = request.query as { questionCode?: string };

    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }

    let query = db
      .select()
      .from(records)
      .where(and(eq(records.matchId, matchId), eq(records.isDeleted, false)));

    const rows = await query;
    return reply.send({ status: "success", message: "OK", data: rows });
  });
}
