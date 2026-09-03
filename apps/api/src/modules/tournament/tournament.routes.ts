import type { FastifyInstance } from "fastify";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, tournaments, tournamentPlayers, users, matches, records } from "@oc/db";
import { requireRole, requireAuth } from "../auth/auth.service.js";

export async function tournamentRoutes(app: FastifyInstance) {
  // GET /tournaments — List all tournaments
  app.get("/tournaments", async (_request, reply) => {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.isDeleted, false))
      .orderBy(desc(tournaments.createdAt));
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
      const tournamentCode = `OC3_T_${Date.now().toString(36).toUpperCase()}`;

      const result = await db
        .insert(tournaments)
        .values({
          tournamentCode,
          tournamentName: body.tournamentName,
          description: body.description,
          tournamentFormat: body.tournamentFormat || "oc3",
          startDate: body.startDate,
          endDate: body.endDate,
          maxPlayers: body.maxPlayers,
          venue: body.venue,
          notes: body.notes,
          createdBy: session.userId,
        })
        .returning();

      return reply.code(201).send({
        status: "success",
        message: "Tournament created",
        data: result[0],
      });
    },
  );

  // GET /tournaments/:code — Get tournament details
  app.get("/tournaments/:code", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const rows = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.tournamentCode, slug),
          eq(tournaments.isDeleted, false),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return reply
        .code(404)
        .send({ status: "error", message: "Tournament not found", data: null });
    }

    // Get players in this tournament
    const players = await db
      .select({
        id: tournamentPlayers.id,
        role: tournamentPlayers.role,
        groupNumber: tournamentPlayers.groupNumber,
        notes: tournamentPlayers.notes,
        userCode: users.userCode,
        userName: users.userName,
        userId: users.id,
        email: users.email,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, rows[0].id));

    // Get matches linked to this tournament
    const linkedMatches = await db
      .select({
        id: matches.id,
        matchSlug: matches.matchSlug,
        matchPin: matches.matchPin,
        matchName: matches.matchName,
        matchStatus: matches.matchStatus,
        tournamentFormat: matches.tournamentFormat,
        videoUrl: matches.videoUrl,
        createdAt: matches.createdAt,
      })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, rows[0].id),
          eq(matches.isDeleted, false),
        ),
      )
      .orderBy(desc(matches.createdAt));

    return reply.send({
      status: "success",
      message: "OK",
      data: { ...rows[0], players, matches: linkedMatches },
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

      const updates: Record<string, unknown> = { updatedAt: new Date() };
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

      const result = await db
        .update(tournaments)
        .set(updates)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .returning({ id: tournaments.id });

      if (result.length === 0) {
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
      const result = await db
        .update(tournaments)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .returning({ id: tournaments.id });

      if (result.length === 0) {
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

      const validRoles = ["controller", "mc", "player", "spectator"];
      const playerRole =
        body.role && validRoles.includes(body.role) ? body.role : "player";

      // Find tournament
      const tournamentRows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournamentRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      // Find user
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.userCode, body.userCode), eq(users.isDeleted, false)),
        )
        .limit(1);

      if (userRows.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }

      // Check if already added
      const existing = await db
        .select()
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournamentRows[0].id),
            eq(tournamentPlayers.playerId, userRows[0].id),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return reply
          .code(409)
          .send({
            status: "error",
            message: "Player already in tournament",
            data: null,
          });
      }

      // Add player
      await db.insert(tournamentPlayers).values({
        tournamentId: tournamentRows[0].id,
        playerId: userRows[0].id,
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

      // Find tournament
      const tournamentRows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournamentRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      // Find user
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
        .limit(1);

      if (userRows.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }

      // Delete player from tournament
      await db
        .delete(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournamentRows[0].id),
            eq(tournamentPlayers.playerId, userRows[0].id),
          ),
        );

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

      // Find tournament
      const tournamentRows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournamentRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      // Check user's membership
      const membership = await db
        .select({
          role: tournamentPlayers.role,
          groupNumber: tournamentPlayers.groupNumber,
        })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournamentRows[0].id),
            eq(tournamentPlayers.playerId, session.userId),
          ),
        )
        .limit(1);

      return reply.send({
        status: "success",
        message: "OK",
        data: membership.length > 0 ? membership[0] : null,
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

      // Find tournament
      const tournamentRows = await db
        .select({ id: tournaments.id, maxPlayers: tournaments.maxPlayers })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournamentRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const tournament = tournamentRows[0];

      // Check if already registered
      const existing = await db
        .select({ id: tournamentPlayers.id })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournament.id),
            eq(tournamentPlayers.playerId, session.userId),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
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
        const countResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(tournamentPlayers)
          .where(eq(tournamentPlayers.tournamentId, tournament.id));

        const currentCount = Number(countResult[0]?.count ?? 0);
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

      // Register as player
      await db.insert(tournamentPlayers).values({
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

      const validRoles = ["controller", "mc", "player", "spectator"];
      if (!body.role || !validRoles.includes(body.role)) {
        return reply
          .code(400)
          .send({
            status: "error",
            message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
            data: null,
          });
      }

      // Find tournament
      const tournamentRows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, slug),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);

      if (tournamentRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Tournament not found",
            data: null,
          });
      }

      const tournamentId = tournamentRows[0].id;

      // Check if request user is controller or admin
      const requestUserMembership = await db
        .select({ role: tournamentPlayers.role })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournamentId),
            eq(tournamentPlayers.playerId, session.userId),
          ),
        )
        .limit(1);

      const isAdmin = session.role === "admin";
      const isController =
        requestUserMembership.length > 0 &&
        requestUserMembership[0].role === "controller";

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
      const targetMembership = await db
        .select({ id: tournamentPlayers.id })
        .from(tournamentPlayers)
        .where(
          and(
            eq(tournamentPlayers.tournamentId, tournamentId),
            eq(tournamentPlayers.playerId, userId),
          ),
        )
        .limit(1);

      if (targetMembership.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "User is not registered in this tournament",
            data: null,
          });
      }

      // Update role
      await db
        .update(tournamentPlayers)
        .set({ role: body.role })
        .where(eq(tournamentPlayers.id, targetMembership[0].id));

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

    // Find tournament
    const tournamentRows = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .limit(1);

    if (tournamentRows.length === 0) {
      return reply.code(404).send({
        status: "error",
        message: "Tournament not found",
        data: null,
      });
    }

    const tournamentId = tournamentRows[0].id;

    // Get all matches in this tournament
    const matchRows = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isDeleted, false),
        ),
      );

    const matchIds = matchRows.map((m) => m.id);

    if (matchIds.length === 0) {
      return reply.send({
        status: "success",
        message: "OK",
        data: { standings: [] },
      });
    }

    // Get all registered players
    const playerRows = await db
      .select({
        playerId: tournamentPlayers.playerId,
        groupNumber: tournamentPlayers.groupNumber,
        userName: users.userName,
        userCode: users.userCode,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId));

    // Get all player scores in this tournament (via matches join)
    const allRecords = await db
      .select({
        playerId: records.playerId,
        matchId: records.matchId,
        points: records.points,
      })
      .from(records)
      .innerJoin(matches, eq(records.matchId, matches.id))
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(records.isDeleted, false),
          eq(matches.isDeleted, false),
        ),
      );

    // Aggregate scores per player
    const scoreMap = new Map<string, { totalPoints: number; matchesPlayed: number }>();
    const matchPerPlayer = new Map<string, Set<string>>();

    for (const row of allRecords) {
      const prev = scoreMap.get(row.playerId);
      scoreMap.set(row.playerId, {
        totalPoints: (prev?.totalPoints || 0) + row.points,
        matchesPlayed: 0,
      });
      const set = matchPerPlayer.get(row.playerId) ?? new Set<string>();
      set.add(row.matchId);
      matchPerPlayer.set(row.playerId, set);
    }

    for (const [playerId, set] of matchPerPlayer) {
      const entry = scoreMap.get(playerId);
      if (entry) entry.matchesPlayed = set.size;
    }

    // Build standings
    const standings = playerRows
      .map((player) => {
        const scores = scoreMap.get(player.playerId);
        return {
          playerId: player.playerId,
          userName: player.userName,
          userCode: player.userCode,
          groupNumber: player.groupNumber,
          totalPoints: scores?.totalPoints || 0,
          matchesPlayed: scores?.matchesPlayed || 0,
          totalMatches: matchIds.length,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((player, index) => ({
        ...player,
        rank: index + 1,
      }));

    return reply.send({
      status: "success",
      message: "OK",
      data: { standings },
    });
  });
}
