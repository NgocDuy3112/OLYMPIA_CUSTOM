import type { FastifyInstance } from "fastify";
import { requireRole, requireAuth } from "../auth/auth.service.js";
import {
  drizzleTournamentRepo,
  type TournamentRepo,
} from "./tournament.repo.js";

export async function tournamentRoutes(
  app: FastifyInstance,
  opts: { repo?: TournamentRepo } = {},
) {
  const repo = opts.repo ?? drizzleTournamentRepo;
  // GET /tournaments — List all tournaments
  app.get("/tournaments", async (_request, reply) => {
    const rows = await repo.list();
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  // POST /tournaments — Create a new tournament
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

      const created = await repo.create({
        tournamentName: body.tournamentName,
        description: body.description,
        tournamentFormat: body.tournamentFormat || "oc3",
        startDate: body.startDate,
        endDate: body.endDate,
        maxPlayers: body.maxPlayers,
        venue: body.venue,
        notes: body.notes,
        createdBy: session.userId,
      });

      return reply.code(201).send({
        status: "success",
        message: "Tournament created",
        data: created,
      });
    },
  );

  // GET /tournaments/:code — Get tournament details
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

  // PUT /tournaments/:code — Update tournament
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
      if (body.tournamentName) updates.tournamentName = body.tournamentName;
      if (body.description !== undefined)
        updates.description = body.description;
      if (body.tournamentFormat)
        updates.tournamentFormat = body.tournamentFormat;
      if (body.startDate !== undefined) updates.startDate = body.startDate;
      if (body.endDate !== undefined) updates.endDate = body.endDate;
      if (body.status) updates.status = body.status;
      if (body.maxPlayers !== undefined) updates.maxPlayers = body.maxPlayers;
      if (body.venue !== undefined) updates.venue = body.venue;
      if (body.notes !== undefined) updates.notes = body.notes;

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

  // DELETE /tournaments/:code — Soft delete tournament
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

  // POST /tournaments/:code/players — Add player to tournament
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

  // DELETE /tournaments/:code/players/:userCode — Remove player from tournament
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

  // GET /tournaments/:code/me — Get current user's role in this tournament
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

  // POST /tournaments/:code/register — Register as player in tournament
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

      // Check max players limit
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

  // GET /tournaments/me — tournaments current user joined
  app.get(
    "/tournaments/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
      const rows = await repo.listMyTournaments(session.userId);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  // PUT /tournaments/:code/players/:userId/role — Assign role to player
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

      // Check if request user is controller or admin
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

      // Check if target user is registered
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

  // GET /tournaments/:code/standings — Get tournament standings
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
