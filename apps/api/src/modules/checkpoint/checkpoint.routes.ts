import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { db, matchCheckpoints } from "@oc/db";
import { requireRole, requireAuth } from "../auth/auth.service.js";
import {
  restoreFromCheckpoint,
  matchCodeExists,
  checkpointCount,
} from "../../state/checkpoint.service.js";

export async function checkpointRoutes(app: FastifyInstance) {
  // GET /checkpoints/:matchCode — list checkpoints (latest first)
  app.get(
    "/checkpoints/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const rows = await db
        .select({
          id: matchCheckpoints.id,
          matchCode: matchCheckpoints.matchCode,
          createdAt: matchCheckpoints.createdAt,
        })
        .from(matchCheckpoints)
        .where(eq(matchCheckpoints.matchCode, matchCode))
        .orderBy(desc(matchCheckpoints.createdAt))
        .limit(10);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  // POST /checkpoints/:matchCode/restore — restore Valkey from latest checkpoint
  app.post(
    "/checkpoints/:matchCode/restore",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      if (!(await matchCodeExists(matchCode))) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      const ok = await restoreFromCheckpoint(app.valkey, matchCode);
      if (!ok) {
        return reply.code(404).send({
          status: "error",
          message: "No checkpoint found for match",
          data: null,
        });
      }
      const count = await checkpointCount(matchCode);
      return reply.send({
        status: "success",
        message: "Snapshot restored",
        data: { checkpoints: count },
      });
    },
  );
}
