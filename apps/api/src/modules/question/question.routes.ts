import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, questions, matches, tournamentPlayers } from "@oc/db";
import { requireAuth } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { writeAudit } from "../audit/audit.service.js";

export async function questionRoutes(app: FastifyInstance) {
  function getScopes(session: { operatorScopes?: string | null }): string[] {
    return (session.operatorScopes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isGlobalQuestionCreator(session: {
    role: string;
    operatorScopes?: string | null;
  }): boolean {
    if (session.role === "admin") return true;
    if (session.role !== "operator") return false;
    return getScopes(session).includes("question_creator");
  }

  async function isTournamentQuestionAuthor(
    userId: string,
    matchId: string,
  ): Promise<boolean> {
    const matchRows = await db
      .select({ tournamentId: matches.tournamentId })
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    const tournamentId = matchRows[0]?.tournamentId;
    if (!tournamentId) return false;
    const membership = await db
      .select({ role: tournamentPlayers.role })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.playerId, userId),
        ),
      )
      .limit(1);
    // Accept both names: global scope is question_creator,
    // tournament role is qauthor (legacy rows may hold question_author).
    return (
      membership[0]?.role === "qauthor" ||
      membership[0]?.role === "question_author" ||
      membership[0]?.role === "question_creator"
    );
  }

  async function canWriteQuestions(
    session: { userId: string; role: string; operatorScopes?: string | null },
    matchCode: string,
  ): Promise<{ ok: boolean; matchId?: string; message?: string }> {
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) return { ok: false, message: "Match not found" };
    if (isGlobalQuestionCreator(session)) return { ok: true, matchId };
    if (await isTournamentQuestionAuthor(session.userId, matchId))
      return { ok: true, matchId };
    return { ok: false, matchId, message: "Only admin, question_creator or tournament qauthor can write questions" };
  }

  // GET /questions?match_code=...&question_code=... — query style used by web
  // (AGameManagingPage, useGameRound, game pages). Kept alongside param style.
  app.get("/questions", async (request, reply) => {
    const { match_code, matchCode, question_code, questionCode } =
      request.query as {
        match_code?: string;
        matchCode?: string;
        question_code?: string;
        questionCode?: string;
      };
    const code = match_code ?? matchCode;
    if (!code) {
      return reply
        .code(400)
        .send({ status: "error", message: "match_code is required", data: null });
    }
    const matchId = await resolveMatchId(app.valkey, code);
    if (!matchId) {
      return reply
        .code(404)
        .send({ status: "error", message: "Match not found", data: null });
    }
    const qCode = question_code ?? questionCode;
    if (qCode) {
      const rows = await db
        .select()
        .from(questions)
        .where(
          and(
            eq(questions.matchId, matchId),
            eq(questions.questionCode, qCode),
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
    }
    const rows = await db
      .select()
      .from(questions)
      .where(
        and(eq(questions.matchId, matchId), eq(questions.isDeleted, false)),
      );
    return reply.send({ status: "success", message: "OK", data: rows });
  });

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
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const raw = request.body as {
        matchCode?: string;
        match_code?: string;
        questionCode?: string;
        question_code?: string;
        content?: string;
        answer?: string;
        explanation?: string;
        mediaUrl?: string;
        media_url?: string;
        options?: string[] | string;
      };
      const session = (request as unknown as {
        session: { userId: string; role: string; operatorScopes?: string | null; userCode?: string };
      }).session;
      const matchCode = raw.matchCode ?? raw.match_code ?? "";
      const questionCode = raw.questionCode ?? raw.question_code ?? "";
      if (!matchCode || !questionCode || !raw.content || !raw.answer) {
        return reply.code(400).send({
          status: "error",
          message: "matchCode, questionCode, content, answer required",
          data: null,
        });
      }
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        return reply.code(status).send({
          status: "error",
          message: check.message ?? "Forbidden",
          data: null,
        });
      }
      const options = Array.isArray(raw.options)
        ? JSON.stringify(raw.options)
        : typeof raw.options === "string"
          ? raw.options
          : null;
      const result = await db
        .insert(questions)
        .values({
          matchId: check.matchId,
          questionCode,
          content: raw.content,
          answer: raw.answer,
          explanation: raw.explanation,
          mediaUrl: raw.mediaUrl ?? raw.media_url,
          options,
        })
        .returning({ id: questions.id });
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
      });
      return reply.code(201).send({
        status: "success",
        message: "Question created",
        data: { id: result[0].id },
      });
    },
  );

  // PATCH /questions/:matchCode/:questionCode — edit one question.
  // Allowed: admin, operator question_creator, tournament qauthor.
  // Matches AGameManagingPage patchQuestion() call shape.
  app.patch(
    "/questions/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const raw = request.body as {
        content?: string | null;
        answer?: string | null;
        explanation?: string | null;
        mediaUrl?: string | null;
        media_url?: string | null;
        options?: string[] | string | null;
      };
      const session = (request as unknown as {
        session: { userId: string; role: string; operatorScopes?: string | null; userCode?: string };
      }).session;
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        return reply.code(status).send({
          status: "error",
          message: check.message ?? "Forbidden",
          data: null,
        });
      }
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (raw.content !== undefined) updates.content = raw.content;
      if (raw.answer !== undefined) updates.answer = raw.answer;
      if (raw.explanation !== undefined) updates.explanation = raw.explanation;
      if (raw.mediaUrl !== undefined || raw.media_url !== undefined)
        updates.mediaUrl = raw.mediaUrl ?? raw.media_url;
      if (raw.options !== undefined)
        updates.options = Array.isArray(raw.options)
          ? JSON.stringify(raw.options)
          : raw.options;
      if (Object.keys(updates).length <= 1) {
        return reply.code(400).send({
          status: "error",
          message: "Nothing to update",
          data: null,
        });
      }
      const result = await db
        .update(questions)
        .set(updates)
        .where(
          and(
            eq(questions.matchId, check.matchId),
            eq(questions.questionCode, questionCode),
            eq(questions.isDeleted, false),
          ),
        )
        .returning({ id: questions.id });
      if (result.length === 0) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
        details: "question updated",
      });
      return reply.send({
        status: "success",
        message: "Question updated",
        data: { id: result[0].id },
      });
    },
  );

  app.delete(
    "/questions/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const session = (request as unknown as {
        session: { userId: string; role: string; operatorScopes?: string | null; userCode?: string };
      }).session;
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        return reply.code(status).send({
          status: "error",
          message: check.message ?? "Forbidden",
          data: null,
        });
      }
      await db
        .update(questions)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(eq(questions.matchId, check.matchId), eq(questions.isDeleted, false)),
        );
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        details: "questions deleted",
      });
      return reply.send({
        status: "success",
        message: "Questions deleted",
        data: null,
      });
    },
  );

  // DELETE /questions/:matchCode/:questionCode — delete one question.
  app.delete(
    "/questions/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = (request as unknown as {
        session: { userId: string; role: string; operatorScopes?: string | null; userCode?: string };
      }).session;
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        return reply.code(status).send({
          status: "error",
          message: check.message ?? "Forbidden",
          data: null,
        });
      }
      const result = await db
        .update(questions)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(
          and(
            eq(questions.matchId, check.matchId),
            eq(questions.questionCode, questionCode),
            eq(questions.isDeleted, false),
          ),
        )
        .returning({ id: questions.id });
      if (result.length === 0) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
        details: "question deleted",
      });
      return reply.send({
        status: "success",
        message: "Question deleted",
        data: null,
      });
    },
  );
}
