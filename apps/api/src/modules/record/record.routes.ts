import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { drizzleRecordRepo, type RecordRepo } from "./record.repo.js";

export async function recordRoutes(
  app: FastifyInstance,
  opts: { repo?: RecordRepo } = {},
) {
  const repo = opts.repo ?? drizzleRecordRepo;
  // GET /records/:matchCode — list score records for a match. Requires auth.
  app.get(
    "/records/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const { questionCode } = request.query as { questionCode?: string };

      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }

      const rows = await repo.listByMatch(matchId, questionCode);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );
}
