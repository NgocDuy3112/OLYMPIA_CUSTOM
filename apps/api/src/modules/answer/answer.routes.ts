import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, answers } from "@oc/db";
import { resolveBuzzIds } from "../../state/id-cache.js";

export async function answerRoutes(app: FastifyInstance) {
  app.post("/answers/", async (request, reply) => {
    const body = request.body as {
      user_code: string;
      match_code: string;
      question_code: string;
      answer_text?: string;
      has_buzzed?: boolean;
      timestamp?: number;
    };
    const ids = await resolveBuzzIds(
      app.valkey,
      body.match_code,
      body.user_code,
      body.question_code,
    );
    if (!ids.matchId || !ids.playerId || !ids.questionId)
      return reply
        .code(404)
        .send({
          status: "error",
          message: "Match, player, or question not found",
        });
    const existing = await db
      .select({ id: answers.id })
      .from(answers)
      .where(
        and(
          eq(answers.matchId, ids.matchId),
          eq(answers.playerId, ids.playerId),
          eq(answers.questionId, ids.questionId),
          eq(answers.isDeleted, false),
        ),
      )
      .limit(1);
    if (existing.length > 0)
      return reply
        .code(409)
        .send({
          status: "error",
          message: "Player already answered this question",
        });
    const row = await db
      .insert(answers)
      .values({
        matchId: ids.matchId,
        playerId: ids.playerId,
        questionId: ids.questionId,
        answerText: body.answer_text ?? null,
        hasBuzzed: body.has_buzzed ?? false,
        timestamp: body.timestamp == null ? null : String(body.timestamp),
      })
      .returning({ id: answers.id });
    return reply
      .code(201)
      .send({ status: "success", message: "Answer submitted", data: row[0] });
  });

  // GET /answers/:matchCode — list answers for a match
  app.get("/answers/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const matchId = await resolveBuzzIds(app.valkey, matchCode, "", "").then(
      (r) => r.matchId,
    );

    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }

    const rows = await db
      .select()
      .from(answers)
      .where(and(eq(answers.matchId, matchId), eq(answers.isDeleted, false)));

    return reply.send({ status: "success", message: "OK", data: rows });
  });
}
