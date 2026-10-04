import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { requireRole, requireAuth, requireScope, uuidOrNull, reqSession } from "../auth/auth.service.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleMatchRepo, type MatchRepo } from "./match.repo.js";

export async function matchRoutes(
  app: FastifyInstance,
  opts: { repo?: MatchRepo } = {},
) {
  const repo = opts.repo ?? drizzleMatchRepo;
  app.get("/matches", async (request, reply) => {
    const { tournamentCode } = request.query as { tournamentCode?: string };
    const rows = await repo.list(tournamentCode);
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  app.post(
    "/matches",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        matchName: string;
        tournamentCode?: string;
        scheduledAt?: string;
        venue?: string;
        matchLabel?: string;
        phaseId?: string;
      };
      if (!body.matchName) {
        throw new AppError(400, "matchName is required");
      }
      if (body.scheduledAt && Number.isNaN(Date.parse(body.scheduledAt))) {
        throw new AppError(400, "scheduledAt must be a valid date-time");
      }

      const session = reqSession(request);
      let created;
      try {
        created = await repo.create({
          matchName: body.matchName,
          tournamentCode: body.tournamentCode,
          createdBy: uuidOrNull(session.userId),
          scheduledAt: body.scheduledAt ?? null,
          venue: body.venue?.trim().slice(0, 200) || null,
          matchLabel: body.matchLabel?.trim().toUpperCase().slice(0, 20) || null,
          phaseId: body.phaseId?.trim() || null,
        });
      } catch (err) {
        throw new AppError(400, err instanceof Error ? err.message : "Create failed");
      }

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

  app.get("/matches/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const row = await repo.findBySlug(slug);
    if (!row) {
      throw new AppError(404, "Match not found");
    }
    const players = await repo.listPlayers(row.id);
    return reply.send({
      status: "success",
      message: "OK",
      data: { ...row, players },
    });
  });

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
        scheduledAt?: string | null;
        venue?: string | null;
        matchLabel?: string | null;
        phaseId?: string | null;
      };
      if (body.scheduledAt && Number.isNaN(Date.parse(body.scheduledAt))) {
        throw new AppError(400, "scheduledAt must be a valid date-time");
      }
      const updated = await repo.update(slug, {
        matchName: body.matchName,
        matchStatus: body.matchStatus,
        videoUrl: body.videoUrl,
        tournamentFormat: body.tournamentFormat,
        tournamentCode: body.tournamentCode,
        matchPin: body.matchPin,
        scheduledAt: body.scheduledAt === null ? null : (body.scheduledAt ?? undefined),
        venue: body.venue === null ? null : body.venue?.trim().slice(0, 200),
        matchLabel: body.matchLabel === null ? null : body.matchLabel?.trim().toUpperCase().slice(0, 20),
        phaseId: body.phaseId === null ? null : (body.phaseId?.trim() || undefined),
      });
      if (!updated) {
        throw new AppError(404, "Match not found");
      }
      if (body.matchStatus) {
        const session = reqSession(request) as { userCode?: string } | undefined;
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

  app.post(
    "/matches/join",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const body = request.body as { pin: string };
      const session = reqSession(request);

      if (!body.pin || body.pin.length !== 6) {
        throw new AppError(400, "PIN must be 6 digits");
      }

      const match = await repo.findByPin(body.pin);

      if (!match) {
        throw new AppError(404, "Invalid PIN");
      }

      if (match.matchStatus === "finished" || match.matchStatus === "completed") {
        throw new AppError(400, "Match has already ended");
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
        throw new AppError(status, message);
      }
      return reply.send({
        status: "success",
        message: "Player added",
        data: null,
      });
    },
  );
}
