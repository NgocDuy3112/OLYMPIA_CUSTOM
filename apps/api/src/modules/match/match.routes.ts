import type { FastifyInstance } from "fastify";
import { requireRole, requireAuth, requireScope } from "../auth/auth.service.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleMatchRepo, type MatchRepo } from "./match.repo.js";

export async function matchRoutes(
  app: FastifyInstance,
  opts: { repo?: MatchRepo } = {},
) {
  const repo = opts.repo ?? drizzleMatchRepo;
  // GET /matches — List all matches
  app.get("/matches", async (request, reply) => {
    const { tournamentCode } = request.query as { tournamentCode?: string };
    const rows = await repo.list(tournamentCode);
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  // POST /matches — Create a new match (admin only; controller runs live)
  app.post(
    "/matches",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        matchName: string;
        tournamentCode?: string;
      };
      if (!body.matchName) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: "matchName is required",
            data: null,
          });
      }

      const session = (request as any).session;
      const created = await repo.create({
        matchName: body.matchName,
        tournamentCode: body.tournamentCode,
        createdBy: session.userId,
      });

      const auditSession = session as { userCode?: string } | undefined;
      void writeAudit({
        actionType: "MATCH_CREATED",
        actorCode: auditSession?.userCode ?? null,
        matchCode: created.matchCode,
        details: created.matchName,
      });

      return reply.code(201).send({
        status: "success",
        message: "Match created",
        data: {
          matchSlug: created.matchSlug,
          matchCode: created.matchCode,
          matchPin: created.matchPin,
          matchName: created.matchName,
        },
      });
    },
  );

  // GET /matches/:slug — Get match by slug
  app.get("/matches/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const row = await repo.findBySlug(slug);
    if (!row) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }
    const players = await repo.listPlayers(row.id);
    return reply.send({
      status: "success",
      message: "OK",
      data: { ...row, players },
    });
  });

  // PUT /matches/:slug — Update match (admin only; controller runs live)
  app.put(
    "/matches/:slug",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        matchName?: string;
        matchStatus?: string;
        videoUrl?: string;
        tournamentFormat?: string;
        tournamentCode?: string | null;
        matchPin?: string;
      };
      const updated = await repo.update(slug, {
        matchName: body.matchName,
        matchStatus: body.matchStatus,
        videoUrl: body.videoUrl,
        tournamentFormat: body.tournamentFormat,
        tournamentCode: body.tournamentCode,
        matchPin: body.matchPin,
      });
      if (!updated) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      if (body.matchStatus) {
        const session = (request as any).session as { userCode?: string } | undefined;
        void writeAudit({
          actionType: "MATCH_STATE_CHANGE",
          actorCode: session?.userCode ?? null,
          matchCode: updated.matchCode,
          details: `status -> ${body.matchStatus}`,
        });
      }
      return reply.send({
        status: "success",
        message: "Match updated",
        data: null,
      });
    },
  );

  // POST /matches/join — Join match by PIN
  app.post(
    "/matches/join",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const body = request.body as { pin: string };
      const session = (request as any).session;

      if (!body.pin || body.pin.length !== 6) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: "PIN must be 6 digits",
            data: null,
          });
      }

      // Find match by PIN
      const match = await repo.findByPin(body.pin);

      if (!match) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Invalid PIN",
            data: null,
          });
      }

      // Check if match is joinable
      if (match.matchStatus === "finished" || match.matchStatus === "completed") {
        return reply
          .code(400)
          .send({
            status: "error",
            message: "Match has already ended",
            data: null,
          });
      }

      return reply.send({
        status: "success",
        message: "Match found",
        data: {
          matchSlug: match.matchSlug,
          matchName: match.matchName,
        },
      });
    },
  );

  // POST /matches/:slug/players — Add player to match (admin only; controller runs live)
  app.post(
    "/matches/:slug/players",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as { userCode: string; position: number };
      try {
        await repo.upsertPlayer(slug, {
          userCode: body.userCode,
          position: body.position,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        const status = message.includes("not found") ? 404 : 403;
        return reply.code(status).send({
          status: "error",
          message,
          data: null,
        });
      }
      return reply.send({
        status: "success",
        message: "Player added",
        data: null,
      });
    },
  );
}
