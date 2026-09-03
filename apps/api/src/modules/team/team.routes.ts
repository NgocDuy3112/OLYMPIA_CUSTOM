import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, tournamentTeams, teamMembers, users, tournaments } from "@oc/db";
import { requireRole } from "../auth/auth.service.js";

export async function teamRoutes(app: FastifyInstance) {
  // GET /tournaments/:code/teams — List teams in tournament
  app.get("/tournaments/:code/teams", async (request, reply) => {
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

    // Get teams with members
    const teams = await db
      .select({
        id: tournamentTeams.id,
        teamName: tournamentTeams.teamName,
        teamCode: tournamentTeams.teamCode,
        createdAt: tournamentTeams.createdAt,
      })
      .from(tournamentTeams)
      .where(eq(tournamentTeams.tournamentId, tournamentRows[0].id));

    // Get members for each team
    const teamsWithMembers = await Promise.all(
      teams.map(async (team) => {
        const members = await db
          .select({
            id: teamMembers.id,
            playerId: teamMembers.playerId,
            userName: users.userName,
            userCode: users.userCode,
            avatarUrl: users.avatarUrl,
          })
          .from(teamMembers)
          .innerJoin(users, eq(teamMembers.playerId, users.id))
          .where(eq(teamMembers.teamId, team.id));

        return { ...team, members };
      }),
    );

    return reply.send({ status: "success", message: "OK", data: teamsWithMembers });
  });

  // POST /tournaments/:code/teams — Create team
  app.post(
    "/tournaments/:code/teams",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { teamName: string; teamCode: string };

      if (!body.teamName || !body.teamCode) {
        return reply.code(400).send({
          status: "error",
          message: "teamName and teamCode are required",
          data: null,
        });
      }

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

      // Check if team code already exists
      const existing = await db
        .select({ id: tournamentTeams.id })
        .from(tournamentTeams)
        .where(
          and(
            eq(tournamentTeams.tournamentId, tournamentRows[0].id),
            eq(tournamentTeams.teamCode, body.teamCode),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({
          status: "error",
          message: "Team code already exists",
          data: null,
        });
      }

      // Create team
      const result = await db
        .insert(tournamentTeams)
        .values({
          tournamentId: tournamentRows[0].id,
          teamName: body.teamName,
          teamCode: body.teamCode,
        })
        .returning();

      return reply.code(201).send({
        status: "success",
        message: "Team created",
        data: result[0],
      });
    },
  );

  // DELETE /tournaments/:code/teams/:teamId — Delete team
  app.delete(
    "/tournaments/:code/teams/:teamId",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };

      // Delete team (cascade will delete members)
      await db.delete(tournamentTeams).where(eq(tournamentTeams.id, teamId));

      return reply.send({
        status: "success",
        message: "Team deleted",
        data: null,
      });
    },
  );

  // POST /tournaments/:code/teams/:teamId/members — Add member to team
  app.post(
    "/tournaments/:code/teams/:teamId/members",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { teamId } = request.params as { teamId: string };
      const body = request.body as { userCode: string };

      if (!body.userCode) {
        return reply.code(400).send({
          status: "error",
          message: "userCode is required",
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
        return reply.code(404).send({
          status: "error",
          message: "User not found",
          data: null,
        });
      }

      // Check if already in team
      const existing = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.playerId, userRows[0].id),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return reply.code(409).send({
          status: "error",
          message: "User already in this team",
          data: null,
        });
      }

      // Add member
      await db.insert(teamMembers).values({
        teamId,
        playerId: userRows[0].id,
      });

      return reply.code(201).send({
        status: "success",
        message: "Member added",
        data: null,
      });
    },
  );

  // DELETE /tournaments/:code/teams/:teamId/members/:userId — Remove member
  app.delete(
    "/tournaments/:code/teams/:teamId/members/:userId",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { teamId, userId } = request.params as {
        teamId: string;
        userId: string;
      };

      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, teamId),
            eq(teamMembers.playerId, userId),
          ),
        );

      return reply.send({
        status: "success",
        message: "Member removed",
        data: null,
      });
    },
  );
}
