import type { FastifyInstance } from "fastify";
import { requireAuth, requireAgentToken } from "../auth/auth.service.js";
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
        hintText?: string;
        hint_text?: string;
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
        hintText: raw.hintText ?? raw.hint_text ?? null,
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
        hintText?: string | null;
        hint_text?: string | null;
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
        hintText: raw.hintText ?? raw.hint_text,
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

  // GET /bank/search?q=...&round_hint=...&limit=...&page=...&used=...
  // Stable QB_* bank, searchable. Requires auth; answer visible to
  // question writers (admin/qauthor), stripped otherwise.
  // Agent internal calls (X-Agent-Token) bypass session, see full rows.
  // used=only|unused filters by used-where (source_bank_id links);
  // response rows carry usedCount + usedIn [{matchCode, questionCode, isUsed}].
  // Paged: limit (default 20) + page (1-based) -> data {rows,total,limit,page,pages}.
  app.get(
    "/bank/search",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-agent-token"] !== undefined) {
          await requireAgentToken(request, reply);
          if (reply.sent) return;
          (request as unknown as { agentCall?: boolean }).agentCall = true;
          return;
        }
        await requireAuth(app)(request, reply);
      },
    },
    async (request, reply) => {
      const { q, round_hint, roundHint, round_hints, domain, difficulty, set_code, status, limit, page, used } =
        request.query as {
          q?: string;
          round_hint?: string;
          roundHint?: string;
          round_hints?: string;
          domain?: string;
          difficulty?: string;
          set_code?: string;
          status?: string;
          limit?: string;
          page?: string;
          used?: string;
        };
      const session = (
        request as unknown as {
          session?: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
          agentCall?: boolean;
        }
      ).session;
      const agentCall = (request as unknown as { agentCall?: boolean }).agentCall;
      const canSee =
        agentCall === true ||
        session?.role === "admin" ||
        (session?.role === "operator" &&
          getScopes(session).includes("qauthor"));
      const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const pageNum = Math.max(Number(page) || 1, 1);
      const paged = await bankRepo.searchPaged({
        q,
        roundHint: roundHint ?? round_hint,
        roundHints: round_hints ? round_hints.split(",") : undefined,
        domain,
        difficulty: difficulty !== undefined ? Number(difficulty) : undefined,
        setCode: set_code,
        status,
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

  // POST /questions/pick — gộp 2 mode:
  //  - Lẻ (KĐC/KĐR/BP/VĐ): { bankId|bankCode, matchCode, round, slot? }
  //  - Cả set GM: { matchCode, round: "GM", setCode } (setCode hoặc bankCode KEY)
  // GM chặn pick lẻ. Response chuẩn: data { created: [{slot, questionCode, bankCode}], setCode }.
  const SLOT_PATTERNS: Record<string, RegExp> = {
    KD_C: /^KDC_[1-6]$/,
    KD_R: /^KDR[1-4]_[1-6]$/,
    GM: /^GM_(KEY|H[1-8])$/,
    BP: /^BP_[1-4]$/,
    VD: /^VD_(THTH|TNSS|XHPL|VHNT|TTGT|KTTH)_(20|30|40|50)$/,
  };

  function matchSlotToRow(
    round: string,
    slot: string,
    bankRow: { domain: string | null; difficulty: number | null; hintIndex: string | null },
  ): string | null {
    if (round === "VD") {
      const m = /^VD_([A-Z]+)_(\d+)$/.exec(slot);
      if (m && (bankRow.domain !== m[1] || bankRow.difficulty !== Number(m[2]))) {
        return `slot ${slot} needs domain ${m[1]} level ${m[2]}`;
      }
    }
    if (round === "GM") {
      const want = slot === "GM_KEY" ? "KEY" : slot.slice(3);
      if (bankRow.hintIndex !== want) {
        return `slot ${slot} needs hint ${want}`;
      }
    }
    return null;
  }
  // Allowed: admin, operator qauthor, tournament qauthor, or agent token
  // (agent đã xác thực user qauthor ở gateway, audit ghi actor agent).
  app.post(
    "/questions/pick",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-agent-token"] !== undefined) {
          await requireAgentToken(request, reply);
          if (reply.sent) return;
          (request as unknown as { agentCall?: boolean }).agentCall = true;
          return;
        }
        await requireAuth(app)(request, reply);
      },
    },
    async (request, reply) => {
      const raw = request.body as {
        bankId?: string;
        bank_id?: string;
        bankCode?: string;
        bank_code?: string;
        setCode?: string;
        set_code?: string;
        matchCode?: string;
        match_code?: string;
        round?: string;
        slot?: string;
      };
      const session = (
        request as unknown as {
          session?: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
            userCode?: string;
          };
          agentCall?: boolean;
        }
      ).session;
      const agentCall = (request as unknown as { agentCall?: boolean }).agentCall;
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
      const actorCode =
        agentCall === true
          ? `AGENT:${String(request.headers["x-user-code"] ?? "qauthor")}`
          : session?.userCode ?? null;
      if (agentCall !== true) {
        if (!session) {
          return reply.code(401).send({
            status: "error",
            message: "Not authenticated",
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
      }
      const matchId = agentCall === true
        ? await resolveMatchId(app.valkey, matchCode)
        : (await canWriteQuestions(session!, matchCode)).matchId;
      if (!matchId) {
        return reply.code(404).send({
          status: "error",
          message: "Match not found",
          data: null,
        });
      }
      const bankId = raw.bankId ?? raw.bank_id ?? "";
      const bankCode = raw.bankCode ?? raw.bank_code ?? "";
      const ocPrefix = ocPrefixFromCode(matchCode);
      // Mode set GM: { matchCode, round: "GM", setCode } — pick cả 9 1 lần.
      if (round === "GM") {
        let setCode = String(raw.setCode ?? raw.set_code ?? "").trim().toUpperCase();
        if (!setCode) {
          if (!bankCode) {
            return reply.code(400).send({
              status: "error",
              message: "GM chỉ pick cả set: cần setCode (hoặc bankCode KEY)",
              data: null,
            });
          }
          const keyRow = await bankRepo.findByCode(bankCode);
          if (!keyRow || keyRow.hintIndex !== "KEY" || !keyRow.setCode) {
            return reply.code(404).send({
              status: "error",
              message: "KEY row with set_code not found",
              data: null,
            });
          }
          setCode = keyRow.setCode;
        }
        const setRows = await bankRepo.search({ setCode, status: "approved", limit: 100 });
        const byHint = new Map(setRows.map((r) => [r.hintIndex, r]));
        const order = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];
        const missing = order.filter((h) => !byHint.has(h));
        if (missing.length > 0) {
          return reply.code(422).send({
            status: "error",
            message: `GM set ${setCode} incomplete, missing ${missing.join(",")}`,
            data: null,
          });
        }
        const slots = order.map((h) => (h === "KEY" ? "GM_KEY" : `GM_${h}`));
        for (const s of slots) {
          const taken = await repo.findBySlot(matchId, s);
          if (taken) {
            return reply.code(409).send({
              status: "error",
              message: `slot ${s} already filled by ${taken.questionCode}`,
              data: null,
            });
          }
        }
        const created: { slot: string; questionCode: string; bankCode: string }[] = [];
        for (const h of order) {
          const setRow = byHint.get(h)!;
          const slot = h === "KEY" ? "GM_KEY" : `GM_${h}`;
          const suffix = `${Date.now().toString(36).toUpperCase()}`;
          const questionCode = makeQuestionCode(
            ocPrefix.replace(/^OC/, ""),
            `GM_${suffix}`,
          );
          await repo.create({
            matchId,
            questionCode,
            content: setRow.content,
            answer: setRow.answer,
            explanation: setRow.explanation ?? undefined,
            hintText: setRow.hintText ?? undefined,
            mediaUrl: setRow.mediaUrl ?? undefined,
            options: setRow.options ?? undefined,
            sourceBankId: setRow.id,
            slot,
          });
          created.push({ slot, questionCode, bankCode: setRow.bankCode });
        }
        void writeAudit({
          actionType: "QUESTION_USED",
          actorCode,
          matchCode,
          targetCode: setCode,
          details: `picked GM set ${setCode} (9 rows)`,
        });
        return reply.code(201).send({
          status: "success",
          message: "GM set picked",
          data: { setCode, created },
        });
      }
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
      if (bankRow.status !== "approved") {
        return reply.code(422).send({
          status: "error",
          message: `Bank question is ${bankRow.status}, only approved rows can be picked`,
          data: null,
        });
      }
      const slot = String(raw.slot ?? "").trim().toUpperCase() || null;
      if (slot) {
        const pattern = SLOT_PATTERNS[round];
        if (!pattern || !pattern.test(slot)) {
          return reply.code(400).send({
            status: "error",
            message: `slot ${slot} invalid for round ${round}`,
            data: null,
          });
        }
        const taken = await repo.findBySlot(matchId, slot);
        if (taken) {
          return reply.code(409).send({
            status: "error",
            message: `slot ${slot} already filled by ${taken.questionCode}`,
            data: null,
          });
        }
        const slotErr = matchSlotToRow(round, slot, bankRow);
        if (slotErr) {
          return reply.code(422).send({ status: "error", message: slotErr, data: null });
        }
      }
      if (round === "GM") {
        return reply.code(422).send({
          status: "error",
          message: "GM chỉ pick cả set: cần setCode (hoặc bankCode KEY)",
          data: null,
        });
      }
      const suffix = `${Date.now().toString(36).toUpperCase()}`;
      const questionCode = makeQuestionCode(
        ocPrefix.replace(/^OC/, ""),
        `${round}_${suffix}`,
      );
      const existing = await repo.findByCode(matchId, questionCode);
      if (existing) {
        return reply.code(409).send({
          status: "error",
          message: "Generated question code collided, retry",
          data: null,
        });
      }
      await repo.create({
        matchId,
        questionCode,
        content: bankRow.content,
        answer: bankRow.answer,
        explanation: bankRow.explanation ?? undefined,
        hintText: bankRow.hintText ?? undefined,
        mediaUrl: bankRow.mediaUrl ?? undefined,
        options: bankRow.options ?? undefined,
        sourceBankId: bankRow.id,
        slot,
      });
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode,
        matchCode,
        targetCode: questionCode,
        details: `picked from bank ${bankRow.bankCode}`,
      });
      return reply.code(201).send({
        status: "success",
        message: "Question picked from bank",
        data: {
          setCode: null,
          created: [{ slot, questionCode, bankCode: bankRow.bankCode }],
        },
      });
    },
  );

  function isBankWriter(session: {
    role: string;
    operatorScopes?: string | null;
  }): boolean {
    if (session.role === "admin") return true;
    return (
      session.role === "operator" && getScopes(session).includes("qauthor")
    );
  }

  // POST /bank — QAuthor creates a stable QB_* bank row (media chèn sau).
  app.post(
    "/bank",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      if (!isBankWriter(session)) {
        return reply.code(403).send({
          status: "error",
          message: "Only admin or qauthor can write bank",
          data: null,
        });
      }
      const raw = request.body as {
        bankCode?: string;
        content?: string;
        answer?: string;
        explanation?: string;
        hintText?: string;
        hint_text?: string;
        mediaUrl?: string;
        media_url?: string;
        options?: string[] | string;
        roundHint?: string;
        round_hint?: string;
        domain?: string;
        difficulty?: number;
        setCode?: string;
        set_code?: string;
        hintIndex?: string;
        hint_index?: string;
      };
      const bankCode = String(raw.bankCode ?? "").trim().toUpperCase();
      if (!/^QB_[A-Z0-9_]{1,20}$/.test(bankCode)) {
        return reply.code(400).send({
          status: "error",
          message: "bankCode must match QB_* (A-Z/0-9/_, max 20 chars)",
          data: null,
        });
      }
      if (!raw.content?.trim() || !raw.answer?.trim()) {
        return reply.code(400).send({
          status: "error",
          message: "content and answer required",
          data: null,
        });
      }
      const options = Array.isArray(raw.options)
        ? JSON.stringify(raw.options)
        : typeof raw.options === "string"
          ? raw.options
          : null;
      try {
        const result = await bankRepo.create({
          bankCode,
          content: raw.content.trim(),
          answer: raw.answer.trim(),
          explanation: raw.explanation?.trim() || null,
          hintText: (raw.hintText ?? raw.hint_text)?.trim() || null,
          mediaUrl: (raw.mediaUrl ?? raw.media_url)?.trim() || null,
          options,
          roundHint: (raw.roundHint ?? raw.round_hint)?.trim().toUpperCase() || null,
          domain: raw.domain?.trim().toUpperCase() || null,
          difficulty: raw.difficulty ?? null,
          setCode: (raw.setCode ?? raw.set_code)?.trim().toUpperCase() || null,
          hintIndex: (raw.hintIndex ?? raw.hint_index)?.trim().toUpperCase() || null,
          createdBy: session.userId,
        });
        return reply.code(201).send({
          status: "success",
          message: "Bank question created",
          data: { id: result.id, bankCode },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Create failed";
        const code = /unique|duplicate/i.test(msg) ? 409 : 400;
        return reply.code(code).send({
          status: "error",
          message: msg,
          data: null,
        });
      }
    },
  );

  // PATCH /bank/:id — QAuthor edits a bank row (kể cả chèn mediaUrl sau).
  // Agent token cũng được (đã xác thực qauthor ở gateway).
  app.patch(
    "/bank/:id",
    {
      preHandler: async (request, reply) => {
        if (request.headers["x-agent-token"] !== undefined) {
          await requireAgentToken(request, reply);
          if (reply.sent) return;
          (request as unknown as { agentCall?: boolean }).agentCall = true;
          return;
        }
        await requireAuth(app)(request, reply);
      },
    },
    async (request, reply) => {
      const session = (
        request as unknown as {
          session?: { role: string; operatorScopes?: string | null };
          agentCall?: boolean;
        }
      ).session;
      const agentCall = (request as unknown as { agentCall?: boolean }).agentCall;
      if (agentCall !== true && !session) {
        return reply.code(401).send({
          status: "error",
          message: "Not authenticated",
          data: null,
        });
      }
      if (agentCall !== true && !isBankWriter(session!)) {
        return reply.code(403).send({
          status: "error",
          message: "Only admin or qauthor can write bank",
          data: null,
        });
      }
      const { id } = request.params as { id: string };
      const raw = request.body as {
        content?: string | null;
        answer?: string | null;
        explanation?: string | null;
        hintText?: string | null;
        hint_text?: string | null;
        mediaUrl?: string | null;
        media_url?: string | null;
        options?: string[] | string | null;
        roundHint?: string | null;
        round_hint?: string | null;
        domain?: string | null;
        difficulty?: number | null;
        setCode?: string | null;
        set_code?: string | null;
        hintIndex?: string | null;
        hint_index?: string | null;
      };
      const updates: {
        content?: string | null;
        answer?: string | null;
        explanation?: string | null;
        hintText?: string | null;
        mediaUrl?: string | null;
        options?: string | null;
        roundHint?: string | null;
        domain?: string | null;
        difficulty?: number | null;
        setCode?: string | null;
        hintIndex?: string | null;
      } = {};
      if (raw.content !== undefined) updates.content = raw.content;
      if (raw.answer !== undefined) updates.answer = raw.answer;
      if (raw.explanation !== undefined) updates.explanation = raw.explanation;
      if (raw.hintText !== undefined || raw.hint_text !== undefined)
        updates.hintText = raw.hintText ?? raw.hint_text ?? null;
      if (raw.mediaUrl !== undefined || raw.media_url !== undefined)
        updates.mediaUrl = raw.mediaUrl ?? raw.media_url ?? null;
      if (raw.options !== undefined)
        updates.options = Array.isArray(raw.options)
          ? JSON.stringify(raw.options)
          : raw.options;
      if (raw.roundHint !== undefined || raw.round_hint !== undefined)
        updates.roundHint = raw.roundHint ?? raw.round_hint ?? null;
      if (raw.domain !== undefined) updates.domain = raw.domain;
      if (raw.difficulty !== undefined) updates.difficulty = raw.difficulty;
      if (raw.setCode !== undefined || raw.set_code !== undefined)
        updates.setCode = raw.setCode ?? raw.set_code ?? null;
      if (raw.hintIndex !== undefined || raw.hint_index !== undefined)
        updates.hintIndex = raw.hintIndex ?? raw.hint_index ?? null;
      // Sửa nội dung/đáp án câu đã duyệt → rớt về pending, duyệt lại.
      const before = await bankRepo.findById(id);
      const contentChanged = raw.content !== undefined || raw.answer !== undefined;
      const ok = await bankRepo.update(id, updates);
      if (!ok) {
        return reply.code(404).send({
          status: "error",
          message: "Bank question not found or nothing to update",
          data: null,
        });
      }
      if (before?.status === "approved" && contentChanged) {
        await bankRepo.review(id, {
          status: "pending",
          reviewNote: "Tự động: nội dung thay đổi sau duyệt",
        });
      }
      if (agentCall === true) {
        void writeAudit({
          actionType: "QUESTION_USED",
          actorCode: `AGENT:${String(request.headers["x-user-code"] ?? "qauthor")}`,
          targetCode: id,
          details: "bank updated via agent",
        });
      }
      return reply.send({
        status: "success",
        message: "Bank question updated",
        data: { id },
      });
    },
  );

  // DELETE /bank/:id — QAuthor soft-deletes a bank row.
  app.delete(
    "/bank/:id",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (
        request as unknown as {
          session: { role: string; operatorScopes?: string | null };
        }
      ).session;
      if (!isBankWriter(session)) {
        return reply.code(403).send({
          status: "error",
          message: "Only admin or qauthor can write bank",
          data: null,
        });
      }
      const { id } = request.params as { id: string };
      const ok = await bankRepo.softDelete(id);
      if (!ok) {
        return reply.code(404).send({
          status: "error",
          message: "Bank question not found",
          data: null,
        });
      }
      return reply.send({
        status: "success",
        message: "Bank question deleted",
        data: null,
      });
    },
  );

  // POST /bank/:id/review { decision: approved|rejected, note? }
  // Chỉ admin duyệt. OCee hỗ trợ bằng tool suggest_bank_review (read-only),
  // không được write duyệt.
  app.post(
    "/bank/:id/review",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (
        request as unknown as {
          session: {
            userId: string;
            role: string;
            operatorScopes?: string | null;
          };
        }
      ).session;
      const canReview = session.role === "admin";
      if (!canReview) {
        return reply.code(403).send({
          status: "error",
          message: "Only admin can review bank",
          data: null,
        });
      }
      const { id } = request.params as { id: string };
      const raw = request.body as { decision?: string; note?: string };
      const decision = String(raw.decision ?? "").trim().toLowerCase();
      if (decision !== "approved" && decision !== "rejected") {
        return reply.code(400).send({
          status: "error",
          message: "decision must be approved or rejected",
          data: null,
        });
      }
      const note = String(raw.note ?? "").trim();
      if (decision === "rejected" && !note) {
        return reply.code(400).send({
          status: "error",
          message: "note required when rejecting",
          data: null,
        });
      }
      const row = await bankRepo.findById(id);
      if (!row) {
        return reply.code(404).send({
          status: "error",
          message: "Bank question not found",
          data: null,
        });
      }
      const ok = await bankRepo.review(id, {
        status: decision,
        reviewNote: note || null,
        reviewedBy: session.userId,
      });
      if (!ok) {
        return reply.code(404).send({
          status: "error",
          message: "Bank question not found",
          data: null,
        });
      }
      return reply.send({
        status: "success",
        message: `Bank question ${decision}`,
        data: { id, status: decision },
      });
    },
  );
}
