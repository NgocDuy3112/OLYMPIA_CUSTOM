import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { db, matches, matchPlayerPositions, users, tournaments } from "@oc/db";
import { requireRole, requireAuth } from "../auth/auth.service.js";

// Generate random 6-digit PIN
function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function matchRoutes(app: FastifyInstance) {
  // GET /matches — List all matches
  app.get("/matches", async (request, reply) => {
    const { tournamentCode } = request.query as { tournamentCode?: string };

    // If filtering by tournament, resolve tournament id first
    let tournamentId: string | undefined;
    if (tournamentCode) {
      const tRows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          and(
            eq(tournaments.tournamentCode, tournamentCode),
            eq(tournaments.isDeleted, false),
          ),
        )
        .limit(1);
      if (tRows.length === 0) {
        return reply.send({ status: "success", message: "OK", data: [] });
      }
      tournamentId = tRows[0].id;
    }

    const conditions = [eq(matches.isDeleted, false)];
    if (tournamentId) {
      conditions.push(eq(matches.tournamentId, tournamentId));
    }

    const rows = await db
      .select()
      .from(matches)
      .where(and(...conditions))
      .orderBy(desc(matches.createdAt));
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  // POST /matches — Create a new match
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

      // Optional: link match to a tournament
      let tournamentId: string | undefined;
      if (body.tournamentCode) {
        const tRows = await db
          .select({ id: tournaments.id })
          .from(tournaments)
          .where(
            and(
              eq(tournaments.tournamentCode, body.tournamentCode),
              eq(tournaments.isDeleted, false),
            ),
          )
          .limit(1);
        if (tRows.length > 0) {
          tournamentId = tRows[0].id;
        }
      }

      const session = (request as any).session;
      const matchCode = `OC3_M_${Date.now().toString(36).toUpperCase()}`;
      const matchPin = generatePin();

      const result = await db
        .insert(matches)
        .values({
          matchCode,
          matchPin,
          matchName: body.matchName,
          tournamentId: tournamentId ?? null,
          createdBy: session.userId,
        })
        .returning();

      return reply.code(201).send({
        status: "success",
        message: "Match created",
        data: {
          matchSlug: result[0].matchSlug,
          matchCode: result[0].matchCode,
          matchPin: result[0].matchPin,
          matchName: result[0].matchName,
        },
      });
    },
  );

  // GET /matches/:slug — Get match by slug
  app.get("/matches/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const rows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
      .limit(1);
    if (rows.length === 0) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }
    const players = await db
      .select({
        position: matchPlayerPositions.position,
        userCode: users.userCode,
        userName: users.userName,
        userId: users.id,
      })
      .from(matchPlayerPositions)
      .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
      .where(eq(matchPlayerPositions.matchId, rows[0].id))
      .orderBy(matchPlayerPositions.position);
    return reply.send({
      status: "success",
      message: "OK",
      data: { ...rows[0], players },
    });
  });

  // PUT /matches/:slug — Update match
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
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.matchName) updates.matchName = body.matchName;
      if (body.matchStatus) updates.matchStatus = body.matchStatus;
      if (body.videoUrl !== undefined) updates.videoUrl = body.videoUrl;
      if (body.tournamentFormat)
        updates.tournamentFormat = body.tournamentFormat;
      if (body.matchPin) updates.matchPin = body.matchPin;

      // Allow linking/unlinking tournament
      if (body.tournamentCode !== undefined) {
        if (body.tournamentCode === null) {
          updates.tournamentId = null;
        } else {
          const tRows = await db
            .select({ id: tournaments.id })
            .from(tournaments)
            .where(
              and(
                eq(tournaments.tournamentCode, body.tournamentCode),
                eq(tournaments.isDeleted, false),
              ),
            )
            .limit(1);
          if (tRows.length > 0) {
            updates.tournamentId = tRows[0].id;
          }
        }
      }

      const result = await db
        .update(matches)
        .set(updates)
        .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
        .returning({ id: matches.id });
      if (result.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
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
      const matchRows = await db
        .select({
          id: matches.id,
          matchSlug: matches.matchSlug,
          matchName: matches.matchName,
          matchStatus: matches.matchStatus,
        })
        .from(matches)
        .where(and(eq(matches.matchPin, body.pin), eq(matches.isDeleted, false)))
        .limit(1);

      if (matchRows.length === 0) {
        return reply
          .code(404)
          .send({
            status: "error",
            message: "Invalid PIN",
            data: null,
          });
      }

      const match = matchRows[0];

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

  // POST /matches/:slug/players — Add player to match
  app.post(
    "/matches/:slug/players",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as { userCode: string; position: number };
      const matchRows = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
        .limit(1);
      if (matchRows.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
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
      const existing = await db
        .select()
        .from(matchPlayerPositions)
        .where(
          and(
            eq(matchPlayerPositions.matchId, matchRows[0].id),
            eq(matchPlayerPositions.playerId, userRows[0].id),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(matchPlayerPositions)
          .set({ position: body.position })
          .where(eq(matchPlayerPositions.id, existing[0].id));
      } else {
        await db.insert(matchPlayerPositions).values({
          matchId: matchRows[0].id,
          playerId: userRows[0].id,
          position: body.position,
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
