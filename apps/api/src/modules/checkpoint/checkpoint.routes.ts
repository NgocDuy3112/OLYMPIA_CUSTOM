import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { requireRole, requireAuth } from "../auth/auth.service.js";
import { restoreFromCheckpoint } from "../../state/checkpoint.service.js";
import {
  drizzleCheckpointRepo,
  type CheckpointRepo,
} from "./checkpoint.repo.js";

export async function checkpointRoutes(
  app: FastifyInstance,
  opts: { repo?: CheckpointRepo } = {},
) {
  const repo = opts.repo ?? drizzleCheckpointRepo;
  app.get(
    "/checkpoints/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const rows = await repo.listByMatch(matchCode, 10);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  app.post(
    "/checkpoints/:matchCode/restore",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      if (!(await repo.matchCodeExists(matchCode))) {
        throw new AppError(404, "Match not found");
      }
      const ok = await restoreFromCheckpoint(app.valkey, matchCode, { repo });
      if (!ok) {
        throw new AppError(404, "No checkpoint found for match");
      }
      const count = await repo.count(matchCode);
      return reply.send({
        status: "success",
        message: "Snapshot restored",
        data: { checkpoints: count },
      });
    },
  );
}
