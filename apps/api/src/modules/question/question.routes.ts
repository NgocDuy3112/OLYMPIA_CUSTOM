import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, questions } from "@oc/db";
import { requireRole } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";

export async function questionRoutes(app: FastifyInstance) {
  app.get("/questions/:matchCode", async (request, reply) => {
    const { matchCode } = request.params as { matchCode: string };
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }
    const rows = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.matchId, matchId), eq(questions.isDeleted, false)),
      );
    return reply.send({ status: "success", message: "OK", data: rows });
  });

  app.get("/questions/:matchCode/:questionCode", async (request, reply) => {
    const { matchCode, questionCode } = request.params as {
      matchCode: string;
      questionCode: string;
    };
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }
    const rows = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.matchId, matchId),
          eq(questions.questionCode, questionCode),
          eq(questions.isDeleted, false),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      return reply
        .code(404)
        .send({ status: "error", message: "Question not found", data: null });
    }
    return reply.send({ status: "success", message: "OK", data: rows[0] });
  });

  app.post(
    "/questions",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        matchCode: string;
        questionCode: string;
        content: string;
        answer: string;
        explanation?: string;
        mediaUrl?: string;
        options?: string[];
      };
      const matchId = await resolveMatchId(app.valkey, body.matchCode);
      if (!matchId) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      const result = await db
        .insert(questions)
        .values({
          matchId,
          questionCode: body.questionCode,
          content: body.content,
          answer: body.answer,
          explanation: body.explanation,
          mediaUrl: body.mediaUrl,
          options: body.options ? JSON.stringify(body.options) : null,
        })
        .returning({ id: questions.id });
      return reply
        .code(201)
        .send({
          status: "success",
          message: "Question created",
          data: { id: result[0].id },
        });
    },
  );

  app.delete(
    "/questions/:matchCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      await db
        .update(questions)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(eq(questions.matchId, matchId), eq(questions.isDeleted, false)),
        );
      return reply.send({
        status: "success",
        message: "Questions deleted",
        data: null,
      });
    },
  );
}
