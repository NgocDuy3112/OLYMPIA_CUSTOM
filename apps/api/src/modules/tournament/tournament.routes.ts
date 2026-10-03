import type { FastifyInstance } from "fastify";
import { requireRole, requireAuth, uuidOrNull } from "../auth/auth.service.js";
import {
  drizzleTournamentRepo,
  type TournamentRepo,
} from "./tournament.repo.js";
import { drizzleMatchRepo } from "../match/match.repo.js";

export async function tournamentRoutes(
  app: FastifyInstance,
  opts: { repo?: TournamentRepo } = {},
) {
  const repo = opts.repo ?? drizzleTournamentRepo;
  app.get("/tournaments", async (_request, reply) => {
    const rows = await repo.list();
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  app.post(
    "/tournaments",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        tournamentName: string;
        description?: string;
        tournamentFormat?: string;
        startDate?: string;
        endDate?: string;
        maxPlayers?: string;
        venue?: string;
        notes?: string;
      };

      if (!body.tournamentName) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: "tournamentName is required",
            data: null,
          });
      }

      const session = (request as any).session;

      const emptyToNull = (v: unknown): string | null =>
        typeof v === "string" && v.trim() ? v.trim() : null;

      const created = await repo.create({
        tournamentName: body.tournamentName.trim(),
        description: emptyToNull(body.description),
        tournamentFormat: body.tournamentFormat || "oc3",
        startDate: emptyToNull(body.startDate),
        endDate: emptyToNull(body.endDate),
        maxPlayers: emptyToNull(body.maxPlayers),
        venue: emptyToNull(body.venue),
        notes: emptyToNull(body.notes),
        createdBy: uuidOrNull(session.userId),
      });

      return reply.code(201).send({
        status: "success",
        message: "Tournament created",
        data: created,
      });
    },
  );

  app.get("/tournaments/:code", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const tournament = await repo.findByCode(slug);

    if (!tournament) {
      return reply
        .code(404)
        .send({ status: "error", message: "Tournament not found", data: null });
    }

    const players = await repo.listMembers(tournament.id);
    const linkedMatches = await repo.listMatches(tournament.id);

    return reply.send({
      status: "success",
      message: "OK",
      data: { ...tournament, players, matches: linkedMatches },
    });
  });

  app.put(
    "/tournaments/:code",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        tournamentName?: string;
        description?: string;
        tournamentFormat?: string;
        startDate?: string;
        endDate?: string;
        status?: string;
        maxPlayers?: string;
        venue?: string;
        notes?: string;
      };

      const updates: Record<string, unknown> = {};
      const emptyToNull = (v: unknown): string | null =>
        typeof v === "string" && v.trim() ? v.trim() : null;
      if (body.tournamentName) updates.tournamentName = body.tournamentName;
      if (body.description !== undefined)
        updates.description = emptyToNull(body.description);
      if (body.tournamentFormat)
        updates.tournamentFormat = body.tournamentFormat;
      if (body.startDate !== undefined) updates.startDate = emptyToNull(body.startDate);
      if (body.endDate !== undefined) updates.endDate = emptyToNull(body.endDate);
      if (body.status) updates.status = body.status;
      if (body.maxPlayers !== undefined) updates.maxPlayers = emptyToNull(body.maxPlayers);
      if (body.venue !== undefined) updates.venue = emptyToNull(body.venue);
      if (body.notes !== undefined) updates.notes = emptyToNull(body.notes);

      const result = await repo.update(slug, updates);

      if (!result) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      return reply.send({
        status: "success",
        message: "Tournament updated",
        data: null,
      });
    },
  );

  app.delete(
    "/tournaments/:code",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const deleted = await repo.softDelete(slug);

      if (!deleted) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      return reply.send({
        status: "success",
        message: "Tournament deleted",
        data: null,
      });
    },
  );

  app.post(
    "/tournaments/:code/players",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        userCode: string;
        role?: string;
        groupNumber?: string;
        notes?: string;
      };

      if (!body.userCode) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: "userCode is required",
            data: null,
          });
      }

      const validRoles = ["controller", "mc", "qauthor", "player", "spectator"];
      const playerRole =
        body.role && validRoles.includes(body.role) ? body.role : "player";

      const tournament = await repo.findByCode(slug);

      if (!tournament) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const user = await repo.findUserByCode(body.userCode);

      if (!user) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }

      const existing = await repo.findMember(tournament.id, user.id);

      if (existing) {
        return reply
          .code(409)
          .send({
            status: "error",
            message: "Player already in tournament",
            data: null,
          });
      }

      await repo.addMember({
        tournamentId: tournament.id,
        playerId: user.id,
        role: playerRole,
        groupNumber: body.groupNumber,
        notes: body.notes,
      });

      return reply
        .code(201)
        .send({
          status: "success",
          message: "Player added to tournament",
          data: null,
        });
    },
  );

  app.delete(
    "/tournaments/:code/players/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug, userCode } = request.params as {
        slug: string;
        userCode: string;
      };

      const tournament = await repo.findByCode(slug);

      if (!tournament) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const user = await repo.findUserByCode(userCode);

      if (!user) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }

      await repo.removeMember(tournament.id, user.id);

      return reply.send({
        status: "success",
        message: "Player removed from tournament",
        data: null,
      });
    },
  );

  app.get(
    "/tournaments/:code/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const session = (request as any).session;

      const tournament = await repo.findByCode(slug);

      if (!tournament) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const membership = await repo.findMember(tournament.id, session.userId);

      return reply.send({
        status: "success",
        message: "OK",
        data: membership
          ? { role: membership.role, groupNumber: membership.groupNumber ?? null }
          : null,
      });
    },
  );

  app.post(
    "/tournaments/:code/register",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const session = (request as any).session;

      const tournament = await repo.findByCode(slug);

      if (!tournament) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const existing = await repo.findMember(tournament.id, session.userId);

      if (existing) {
        return reply
          .code(409)
          .send({
            status: "error",
            message: "Already registered for this tournament",
            data: null,
          });
      }

      if (tournament.maxPlayers) {
        const currentCount = await repo.countMembers(tournament.id);
        const maxCount = Number(tournament.maxPlayers);

        if (currentCount >= maxCount) {
          return reply
            .code(400)
            .send({
              status: "error",
              message: "Tournament is full",
              data: null,
            });
        }
      }

      await repo.addMember({
        tournamentId: tournament.id,
        playerId: session.userId,
        role: "player",
      });

      return reply.code(201).send({
        status: "success",
        message: "Registered successfully",
        data: null,
      });
    },
  );

  app.get(
    "/tournaments/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
      const rows = await repo.listMyTournaments(session.userId);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  app.put(
    "/tournaments/:code/players/:userId/role",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { slug, userId } = request.params as {
        slug: string;
        userId: string;
      };
      const body = request.body as { role: string };
      const session = (request as any).session;

      const validRoles = ["controller", "mc", "qauthor", "player", "spectator"];
      if (!body.role || !validRoles.includes(body.role)) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
            data: null,
          });
      }

      const tournament = await repo.findByCode(slug);

      if (!tournament) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const tournamentId = tournament.id;

      const requestUserMembership = await repo.findMember(
        tournamentId,
        session.userId,
      );

      const isAdmin = session.role === "admin";
      const isController =
        requestUserMembership !== null &&
        requestUserMembership.role === "controller";

      if (!isAdmin && !isController) {
        return reply
          .code(403)
          .send({
            status: "error",
            message: "Only admin or controller can assign roles",
            data: null,
          });
      }

      const targetMembership = await repo.findMember(tournamentId, userId);

      if (!targetMembership) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "User is not registered in this tournament",
            data: null,
          });
      }

      await repo.updateMemberRole(targetMembership.id, body.role);

      return reply.send({
        status: "success",
        message: "Role updated",
        data: null,
      });
    },
  );

  app.get("/tournaments/:code/bracket", async (request, reply) => {
    const { code } = request.params as { code: string };
    const tournament = await repo.findByCode(code);
    if (!tournament) {
      return reply
        .code(404)
        .send({ status: "error", message: "Tournament not found", data: null });
    }
    const data = await repo.bracket(tournament.id);
    const idToCode = new Map(data.matches.map((m) => [m.id, m.matchCode]));
    const withPlayers = await Promise.all(
      data.matches.map(async (m) => ({
        id: m.id,
        matchSlug: m.matchSlug,
        matchCode: m.matchCode,
        matchName: m.matchName,
        matchStatus: m.matchStatus,
        matchLabel: m.matchLabel,
        scheduledAt: m.scheduledAt,
        venue: m.venue,
        phaseId: m.phaseId,
        players: await drizzleMatchRepo.listPlayers(m.id),
      })),
    );
    return reply.send({
      status: "success",
      message: "OK",
      data: {
        phases: data.phases,
        matches: withPlayers,
        edges: data.edges
          .filter((e) => idToCode.has(e.fromMatchId) && idToCode.has(e.toMatchId))
          .map((e) => ({
            fromMatchCode: idToCode.get(e.fromMatchId),
            rank: e.rank,
            toMatchCode: idToCode.get(e.toMatchId),
          })),
      },
    });
  });

  app.get("/tournaments/:code/standings", async (request, reply) => {
    const { code } = request.params as { code: string };

    const tournament = await repo.findByCode(code);

    if (!tournament) {
      return reply.code(404).send({
        status: "error",
        message: "Tournament not found",
        data: null,
      });
    }

    const standings = await repo.standings(tournament.id);

    return reply.send({
      status: "success",
      message: "OK",
      data: { standings },
    });
  });
}
