import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { db, records, users, matchPlayerPositions, matches } from "@oc/db";
import { resolveMatchId } from "../../state/id-cache.js";

export async function scoreboardRoutes(app: FastifyInstance) {
  // GET /scoreboard/:matchCode — get scoreboard for a match
  app.get("/scoreboard/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }

    // Get players with positions
    const playerRows = await db
      .select({
        userCode: users.userCode,
        userName: users.userName,
        position: matchPlayerPositions.position,
      })
      .from(matchPlayerPositions)
      .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
      .where(eq(matchPlayerPositions.matchId, matchId))
      .orderBy(matchPlayerPositions.position);

    // Get scores
    const scoreRows = await db
      .select({
        userCode: users.userCode,
        totalPoints: sql<number>`COALESCE(SUM(${records.points}), 0)`.as(
          "total_points",
        ),
      })
      .from(records)
      .innerJoin(users, eq(records.playerId, users.id))
      .where(and(eq(records.matchId, matchId), eq(records.isDeleted, false)))
      .groupBy(users.userCode);

    const scoreMap = new Map(
      scoreRows.map((r) => [r.userCode, Number(r.totalPoints)]),
    );

    const scoreboard = playerRows.map((p) => ({
      userCode: p.userCode,
      userName: p.userName,
      position: p.position,
      score: scoreMap.get(p.userCode) ?? 0,
    }));

    // Sort by score descending
    scoreboard.sort((a, b) => b.score - a.score);

    return reply.send({
      status: "success",
      message: "OK",
      data: { scoreboard },
    });
  });
}
