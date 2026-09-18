import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleQuestionRepo, type QuestionRepo } from "./question.repo.js";

export async function questionRoutes(
  app: FastifyInstance,
  opts: { repo?: QuestionRepo } = {},
) {
  const repo = opts.repo ?? drizzleQuestionRepo;
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
    const role = await repo.findTournamentRole(userId, matchId);
    // Accept both names: global scope is question_creator,
    // tournament role is qauthor (legacy rows may hold question_author).
    return (
      role === "qauthor" ||
      role === "question_author" ||
      role === "question_creator"
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
      const row = await repo.findByCode(matchId, qCode);
      if (!row) {
        return reply
          .code(404)
          .send({ status: "error", message: "Question not found", data: null });
      }
      return reply.send({ status: "success", message: "OK", data: row });
    }
    const rows = await repo.listByMatchId(matchId);
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
    const rows = await repo.listByMatchId(matchId);
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
    const row = await repo.findByCode(matchId, questionCode);
    if (!row) {
      return reply
        .code(404)
        .send({ status: "error", message: "Question not found", data: null });
    }
    return reply.send({ status: "success", message: "OK", data: row });
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
      const result = await repo.create({
        matchId: check.matchId,
        questionCode,
        content: raw.content,
        answer: raw.answer,
        explanation: raw.explanation,
        mediaUrl: raw.mediaUrl ?? raw.media_url,
        options,
      });
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
      });
      return reply.code(201).send({
        status: "success",
        message: "Question created",
        data: { id: result.id },
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
      const result = await repo.update(check.matchId, questionCode, {
        content: raw.content,
        answer: raw.answer,
        explanation: raw.explanation,
        mediaUrl: raw.mediaUrl ?? raw.media_url,
        options: raw.options,
      });
      if (!result) {
        return reply.code(400).send({
          status: "error",
          message: "Nothing to update",
          data: null,
        });
      }
      const row = await repo.findByCode(check.matchId, questionCode);
      if (!row) {
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
        data: { id: result.id },
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
      await repo.softDeleteAll(check.matchId);
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
      const deleted = await repo.softDeleteOne(check.matchId, questionCode);
      if (!deleted) {
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
