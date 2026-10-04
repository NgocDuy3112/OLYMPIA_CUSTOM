import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { isOperatorLike, requireAuth, requireScope, reqSession } from "../auth/auth.service.js";
import { writeAudit } from "../audit/audit.service.js";
import { manager } from "../ws/ws.manager.js";
import {
  QUALIFIER_TIME_LIMIT_MS,
  isQualifierTimeout,
} from "@oc/engine";
import {
  drizzleQualifierRepo,
  type QualifierRepo,
} from "./qualifier.repo.js";
import { clampLimit } from "../../utils/pagination.js";

const OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

function validateOptions(options: unknown): options is string[] {
  return (
    Array.isArray(options) &&
    options.length >= 4 &&
    options.length <= 6 &&
    options.every((o) => typeof o === "string" && o.trim().length > 0)
  );
}

function validateOptionLetter(v: unknown): v is string {
  return typeof v === "string" && (OPTIONS as readonly string[]).includes(v);
}

function stripQualifierAnswer<T extends { correctOption?: unknown }>(
  row: T,
  canSee: boolean,
): T {
  if (canSee) return row;
  return { ...row, correctOption: "" };
}

export async function qualifierRoutes(
  app: FastifyInstance,
  opts: { repo?: QualifierRepo } = {},
) {
  const repo = opts.repo ?? drizzleQualifierRepo;

  function getScopes(session: { operatorScopes?: string | null }): string[] {
    return (session.operatorScopes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isQAuthor(session: { role: string; operatorScopes?: string | null }) {
    if (session.role === "admin") return true;
    return (
      isOperatorLike(session.role) && getScopes(session).includes("qauthor")
    );
  }

  async function resolveTournament(code: string) {
    const t = await repo.findTournamentByCode(code);
    return t;
  }

  app.get(
    "/qualifier/:tournamentCode/questions",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const session = reqSession(request);
      const rows = await repo.listQuestions(t.id);
      return reply.send({
        status: "success",
        message: "OK",
        data: rows.map((r) => stripQualifierAnswer(r, isQAuthor(session))),
      });
    },
  );

  app.post(
    "/qualifier/:tournamentCode/questions",
    { preHandler: [requireScope(app, "qauthor")] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const raw = request.body as {
        questionCode?: string;
        content?: string;
        options?: unknown;
        correctOption?: unknown;
        explanation?: string;
        mediaUrl?: string;
        position?: number;
      };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      if (!raw.questionCode || !raw.content) {
        throw new AppError(400, "questionCode, content required");
      }
      if (!validateOptions(raw.options)) {
        throw new AppError(400, "options must be 4-6 non-empty strings");
      }
      if (!validateOptionLetter(raw.correctOption)) {
        throw new AppError(400, "correctOption must be one of A-F");
      }
      const idx = (OPTIONS as readonly string[]).indexOf(raw.correctOption);
      if (idx >= raw.options.length) {
        throw new AppError(400, "correctOption exceeds options length");
      }
      const position = Number(raw.position ?? 0);
      if (!Number.isInteger(position) || position < 1 || position > 16) {
        throw new AppError(400, "position must be integer 1-16");
      }
      try {
        const created = await repo.createQuestion({
          tournamentId: t.id,
          questionCode: raw.questionCode,
          content: raw.content,
          options: raw.options.map((o) => o.trim()),
          correctOption: raw.correctOption,
          explanation: raw.explanation,
          mediaUrl: raw.mediaUrl,
          position,
        });
        const session = reqSession(request);
        void writeAudit({
          actionType: "MATCH_CREATED",
          actorCode: session?.userCode ?? null,
          matchCode: tournamentCode,
          targetCode: raw.questionCode,
          details: "qualifier question created",
        });
        void manager.broadcast(`qualifier_${tournamentCode}`, {
          type: "qualifier_opened",
          tournament_code: tournamentCode,
          question_code: raw.questionCode,
          position,
        });
        return reply.code(201).send({
          status: "success",
          message: "Qualifier question created",
          data: { id: created.id },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Create failed";
        const code = /unique|duplicate|uq_qualifier/i.test(msg) ? 409 : 400;
        throw new AppError(code, msg);
      }
    },
  );

  app.patch(
    "/qualifier/:tournamentCode/questions/:questionCode",
    { preHandler: [requireScope(app, "qauthor")] },
    async (request, reply) => {
      const { tournamentCode, questionCode } = request.params as {
        tournamentCode: string;
        questionCode: string;
      };
      const raw = request.body as {
        content?: string;
        options?: unknown;
        correctOption?: unknown;
        explanation?: string | null;
        mediaUrl?: string | null;
        position?: number;
      };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        throw new AppError(404, "Question not found");
      }
      if (q.status !== "open") {
        throw new AppError(400, "Closed question cannot be edited");
      }
      const updates: {
        content?: string;
        options?: string[];
        correctOption?: string;
        explanation?: string | null;
        mediaUrl?: string | null;
        position?: number;
      } = {};
      if (raw.content !== undefined) updates.content = raw.content;
      if (raw.options !== undefined) {
        if (!validateOptions(raw.options)) {
          throw new AppError(400, "options must be 4-6 non-empty strings");
        }
        updates.options = raw.options.map((o) => o.trim());
      }
      if (raw.correctOption !== undefined) {
        if (!validateOptionLetter(raw.correctOption)) {
          throw new AppError(400, "correctOption must be one of A-F");
        }
        updates.correctOption = raw.correctOption;
      }
      if (raw.explanation !== undefined) updates.explanation = raw.explanation;
      if (raw.mediaUrl !== undefined) updates.mediaUrl = raw.mediaUrl;
      if (raw.position !== undefined) {
        const p = Number(raw.position);
        if (!Number.isInteger(p) || p < 1 || p > 16) {
          throw new AppError(400, "position must be integer 1-16");
        }
        updates.position = p;
      }
      const ok = await repo.updateQuestion(q.id, updates);
      if (!ok) {
        throw new AppError(400, "Nothing to update");
      }
      void manager.broadcast(`qualifier_${tournamentCode}`, {
        type: "qualifier_updated",
        tournament_code: tournamentCode,
        question_code: questionCode,
      });
      return reply.send({
        status: "success",
        message: "Qualifier question updated",
        data: { id: q.id },
      });
    },
  );

  app.delete(
    "/qualifier/:tournamentCode/questions/:questionCode",
    { preHandler: [requireScope(app, "qauthor")] },
    async (request, reply) => {
      const { tournamentCode, questionCode } = request.params as {
        tournamentCode: string;
        questionCode: string;
      };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        throw new AppError(404, "Question not found");
      }
      const ok = await repo.softDeleteQuestion(q.id);
      if (!ok) {
        throw new AppError(400, "Delete failed");
      }
      void manager.broadcast(`qualifier_${tournamentCode}`, {
        type: "qualifier_deleted",
        tournament_code: tournamentCode,
        question_code: questionCode,
      });
      return reply.send({
        status: "success",
        message: "Qualifier question deleted",
        data: null,
      });
    },
  );

  app.post(
    "/qualifier/:tournamentCode/questions/:questionCode/attempt",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { tournamentCode, questionCode } = request.params as {
        tournamentCode: string;
        questionCode: string;
      };
      const raw = request.body as {
        selectedOption?: unknown;
        responseTimeMs?: unknown;
      };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        throw new AppError(404, "Question not found");
      }
      if (!validateOptionLetter(raw.selectedOption)) {
        throw new AppError(400, "selectedOption must be one of A-F");
      }
      const ms = Number(raw.responseTimeMs ?? 0);
      if (!Number.isFinite(ms) || ms < 0) {
        throw new AppError(400, "responseTimeMs must be >= 0");
      }
      if (isQualifierTimeout(ms)) {
        throw new AppError(400, `Time limit ${QUALIFIER_TIME_LIMIT_MS}ms exceeded`);
      }
      const session = reqSession(request);
      try {
        await repo.submitAttempt({
          questionId: q.id,
          playerId: session.userId,
          selectedOption: raw.selectedOption,
          responseTimeMs: Math.round(ms),
        });
        return reply.code(201).send({
          status: "success",
          message: "Attempt recorded",
          data: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Submit failed";
        const code = msg === "Question closed" ? 400 : 400;
        throw new AppError(code, msg);
      }
    },
  );

  app.post(
    "/qualifier/:tournamentCode/questions/:questionCode/close",
    { preHandler: [requireScope(app, "qauthor", "controller")] },
    async (request, reply) => {
      const { tournamentCode, questionCode } = request.params as {
        tournamentCode: string;
        questionCode: string;
      };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        throw new AppError(404, "Question not found");
      }
      if (q.status === "closed") {
        throw new AppError(400, "Already closed");
      }
      const n = await repo.countMembers(t.id);
      const result = await repo.closeAndScore(q.id, n);
      const session = reqSession(request);
      void writeAudit({
        actionType: "MATCH_STATE_CHANGE",
        actorCode: session?.userCode ?? null,
        matchCode: tournamentCode,
        targetCode: questionCode,
        details: `qualifier closed X=${result.correctCount} Y=${result.wrongCount} Z=${result.noAnswerCount}`,
      });
      void manager.broadcast(`qualifier_${tournamentCode}`, {
        type: "qualifier_closed",
        tournament_code: tournamentCode,
        question_code: questionCode,
        correct_count: result.correctCount,
        wrong_count: result.wrongCount,
        no_answer_count: result.noAnswerCount,
        per_correct: result.perCorrect,
        per_wrong: result.perWrong,
      });
      return reply.send({
        status: "success",
        message: "Qualifier question closed and scored",
        data: result,
      });
    },
  );

  app.get(
    "/qualifier/:tournamentCode/standings",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const { limit } = request.query as { limit?: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const n = clampLimit(limit, 16);
      const rows = await repo.standings(t.id, n);
      return reply.send({
        status: "success",
        message: "OK",
        data: rows,
      });
    },
  );

  app.post(
    "/qualifier/:tournamentCode/close-all",
    { preHandler: [requireScope(app, "qauthor", "controller")] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        throw new AppError(404, "Tournament not found");
      }
      const n = await repo.countMembers(t.id);
      const open = (await repo.listQuestions(t.id)).filter(
        (q) => q.status === "open",
      );
      const results: Array<{ questionCode: string; result: unknown }> = [];
      for (const q of open) {
        const result = await repo.closeAndScore(q.id, n);
        results.push({ questionCode: q.questionCode, result });
        void manager.broadcast(`qualifier_${tournamentCode}`, {
          type: "qualifier_closed",
          tournament_code: tournamentCode,
          question_code: q.questionCode,
          correct_count: result.correctCount,
          wrong_count: result.wrongCount,
          no_answer_count: result.noAnswerCount,
          per_correct: result.perCorrect,
          per_wrong: result.perWrong,
        });
      }
      const session = reqSession(request);
      void writeAudit({
        actionType: "MATCH_STATE_CHANGE",
        actorCode: session?.userCode ?? null,
        matchCode: tournamentCode,
        details: `qualifier close-all ${results.length} questions`,
      });
      return reply.send({
        status: "success",
        message: `Closed ${results.length} questions`,
        data: { closed: results.length, results },
      });
    },
  );
}
