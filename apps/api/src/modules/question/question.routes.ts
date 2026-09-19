import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleQuestionRepo, type QuestionRepo } from "./question.repo.js";
import { drizzleBankRepo, type BankRepo } from "./bank.repo.js";
import {
  makeQuestionCode,
  ocPrefixFromCode,
} from "@oc/shared";

export async function questionRoutes(
  app: FastifyInstance,
  opts: { repo?: QuestionRepo; bankRepo?: BankRepo } = {},
) {
  const repo = opts.repo ?? drizzleQuestionRepo;
  const bankRepo = opts.bankRepo ?? drizzleBankRepo;
  function getScopes(session: { operatorScopes?: string | null }): string[] {
    return (session.operatorScopes ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function isGlobalQAuthor(session: {
    role: string;
    operatorScopes?: string | null;
  }): boolean {
    if (session.role === "admin") return true;
    if (session.role !== "operator") return false;
    return getScopes(session).includes("qauthor");
  }

  async function isTournamentQuestionAuthor(
    userId: string,
    matchId: string,
  ): Promise<boolean> {
    const role = await repo.findTournamentRole(userId, matchId);
    return role === "qauthor";
  }

  async function canWriteQuestions(
    session: { userId: string; role: string; operatorScopes?: string | null },
    matchCode: string,
  ): Promise<{ ok: boolean; matchId?: string; message?: string }> {
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) return { ok: false, message: "Match not found" };
    if (isGlobalQAuthor(session)) return { ok: true, matchId };
    if (await isTournamentQuestionAuthor(session.userId, matchId))
      return { ok: true, matchId };
    return { ok: false, matchId, message: "Only admin or qauthor can write questions" };
  }

  async function canSeeAnswer(
    session: { userId: string; role: string; operatorScopes?: string | null },
    matchId: string,
  ): Promise<boolean> {
    if (isGlobalQAuthor(session)) return true;
    if (getScopes(session).includes("controller")) return true;
    const role = await repo.findTournamentRole(session.userId, matchId);
    return role === "qauthor" || role === "controller";
  }

  function stripQuestion<T extends { answer?: unknown; explanation?: unknown }>(
    row: T,
    canSee: boolean,
  ): T {
    if (canSee) return row;
    return { ...row, answer: "", explanation: null };
  }

  // GET /questions?match_code=...&question_code=... — query style used by web
  // (AGameManagingPage, useGameRound, game pages). Kept alongside param style.
  // Requires auth; answer/explanation stripped unless privileged (admin,
  // qauthor, controller, tournament qauthor/controller).
  app.get(
    "/questions",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
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
    const session = (
      request as unknown as {
        session: {
          userId: string;
          role: string;
          operatorScopes?: string | null;
        };
      }
    ).session;
    const canSee = await canSeeAnswer(session, matchId);
    if (qCode) {
      const row = await repo.findByCode(matchId, qCode);
      if (!row) {
        return reply
          .code(404)
          .send({ status: "error", message: "Question not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: stripQuestion(row, canSee),
      });
    }
    const rows = await repo.listByMatchId(matchId);
    return reply.send({
      status: "success",
      message: "OK",
      data: rows.map((r) => stripQuestion(r, canSee)),
    });
  });

  app.get(
    "/questions/:matchCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode } = request.params as { matchCode: string };
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        return reply
          .code(404)
          .send({ status: "error", message: "Match not found", data: null });
      }
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const canSee = await canSeeAnswer(session, matchId);
      const rows = await repo.listByMatchId(matchId);
      return reply.send({
        status: "success",
        message: "OK",
        data: rows.map((r) => stripQuestion(r, canSee)),
      });
    },
  );

  app.get(
    "/questions/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
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
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const canSee = await canSeeAnswer(session, matchId);
      const row = await repo.findByCode(matchId, questionCode);
      if (!row) {
        return reply
          .code(404)
          .send({ status: "error", message: "Question not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: stripQuestion(row, canSee),
      });
    },
  );

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
  // Allowed: admin, operator qauthor, tournament qauthor.
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

  // POST /questions/:matchCode/:questionCode/use — mark question used live.
  // Called when controller broadcasts send_question over WS.
  // Allowed: admin, operator controller, tournament controller.
  app.post(
    "/questions/:matchCode/:questionCode/use",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
            userCode?: string;
          };
        }
      ).session;
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        return reply.code(404).send({
          status: "error",
          message: "Match not found",
          data: null,
        });
      }
      const scopes = getScopes(session);
      const isController =
        session.role === "admin" ||
        (session.role === "operator" && scopes.includes("controller"));
      if (!isController) {
        const role = await repo.findTournamentRole(session.userId, matchId);
        if (role !== "controller") {
          return reply.code(403).send({
            status: "error",
            message: "Controller only",
            data: null,
          });
        }
      }
      const ok = await repo.markUsed(matchId, questionCode);
      if (!ok) {
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
        details: "question marked used live",
      });
      return reply.send({
        status: "success",
        message: "Question marked used",
        data: null,
      });
    },
  );

  // GET /bank/search?q=...&tags=...&round_hint=...&limit=...&page=...&used=...
  // Stable QB_* bank, searchable. Requires auth; answer visible to
  // question writers (admin/qauthor), stripped otherwise.
  // used=only|unused filters by used-where (source_bank_id links);
  // response rows carry usedCount + usedIn [{matchCode, questionCode, isUsed}].
  // Paged: limit (default 20) + page (1-based) -> data {rows,total,limit,page,pages}.
  app.get(
    "/bank/search",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { q, tags, round_hint, roundHint, limit, page, used } =
        request.query as {
          q?: string;
          tags?: string;
          round_hint?: string;
          roundHint?: string;
          limit?: string;
          page?: string;
          used?: string;
        };
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const canSee =
        session.role === "admin" ||
        (session.role === "operator" &&
          getScopes(session).includes("qauthor"));
      const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const pageNum = Math.max(Number(page) || 1, 1);
      const paged = await bankRepo.searchPaged({
        q,
        tags,
        roundHint: roundHint ?? round_hint,
        limit: pageSize,
        offset: (pageNum - 1) * pageSize,
      });
      const usedFilter = String(used ?? "").trim().toLowerCase();
      const rows =
        usedFilter === "only"
          ? paged.rows.filter((r) => r.usedCount > 0)
          : usedFilter === "unused"
            ? paged.rows.filter((r) => r.usedCount === 0)
            : paged.rows;
      return reply.send({
        status: "success",
        message: "OK",
        data: {
          rows: rows.map((r) => (canSee ? r : { ...r, answer: "" })),
          total: paged.total,
          limit: paged.limit,
          page: pageNum,
          pages: Math.max(Math.ceil(paged.total / paged.limit), 1),
        },
      });
    },
  );

  // POST /questions/pick { bankId|bankCode, matchCode|match_code, round }
  // Copies bank -> match, auto-generates OC<number>_Q_<round>_* code.
  // Allowed: admin, operator qauthor, tournament qauthor.
  app.post(
    "/questions/pick",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const raw = request.body as {
        bankId?: string;
        bank_id?: string;
        bankCode?: string;
        bank_code?: string;
        matchCode?: string;
        match_code?: string;
        round?: string;
      };
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
            userCode?: string;
          };
        }
      ).session;
      const matchCode = raw.matchCode ?? raw.match_code ?? "";
      const round = String(raw.round ?? "").trim().toUpperCase();
      if (!matchCode || !round) {
        return reply.code(400).send({
          status: "error",
          message: "matchCode and round required",
          data: null,
        });
      }
      if (!/^[A-Z0-9_]{1,20}$/.test(round)) {
        return reply.code(400).send({
          status: "error",
          message: "round must be A-Z/0-9/_ (e.g. KD_C, GM, BP, VD)",
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
      const bankId = raw.bankId ?? raw.bank_id ?? "";
      const bankCode = raw.bankCode ?? raw.bank_code ?? "";
      if (!bankId && !bankCode) {
        return reply.code(400).send({
          status: "error",
          message: "bankId or bankCode required",
          data: null,
        });
      }
      const bankRow = bankId
        ? await bankRepo.findById(bankId)
        : await bankRepo.findByCode(bankCode);
      if (!bankRow) {
        return reply.code(404).send({
          status: "error",
          message: "Bank question not found",
          data: null,
        });
      }
      const ocPrefix = ocPrefixFromCode(matchCode);
      const suffix = `${Date.now().toString(36).toUpperCase()}`;
      const questionCode = makeQuestionCode(
        ocPrefix.replace(/^OC/, ""),
        `${round}_${suffix}`,
      );
      const existing = await repo.findByCode(check.matchId, questionCode);
      if (existing) {
        return reply.code(409).send({
          status: "error",
          message: "Generated question code collided, retry",
          data: null,
        });
      }
      const result = await repo.create({
        matchId: check.matchId,
        questionCode,
        content: bankRow.content,
        answer: bankRow.answer,
        explanation: bankRow.explanation ?? undefined,
        mediaUrl: bankRow.mediaUrl ?? undefined,
        options: bankRow.options ?? undefined,
        sourceBankId: bankRow.id,
      });
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session?.userCode ?? null,
        matchCode,
        targetCode: questionCode,
        details: `picked from bank ${bankRow.bankCode}`,
      });
      return reply.code(201).send({
        status: "success",
        message: "Question picked from bank",
        data: { id: result.id, questionCode, bankCode: bankRow.bankCode },
      });
    },
  );
}
