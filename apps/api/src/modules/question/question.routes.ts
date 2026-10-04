import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { isOperatorLike, requireAuth, uuidOrNull, reqSession } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleQuestionRepo, type QuestionRepo } from "./question.repo.js";
import { drizzleBankRepo, type BankRepo } from "./bank.repo.js";
import {
  makeQuestionCode,
  ocPrefixFromCode,
} from "@oc/shared";
import { emitBankChanged } from "./bank-events.js";
import {
  assignAutoCodes,
  autoCodePrefixes,
  MAX_IMPORT_ROWS,
  nextSequentialSetCode,
  normalizeRows,
  validateGmSets,
  validateRow,
  vnDate,
  type MediaWarning,
  type RawItem,
  type RowIssue,
} from "./bank-import.js";
import { clampLimit, clampPage } from "../../utils/pagination.js";

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
    if (!isOperatorLike(session.role)) return false;
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
      throw new AppError(400, "match_code is required");
    }
    const matchId = await resolveMatchId(app.valkey, code);
    if (!matchId) {
      throw new AppError(404, "Match not found");
    }
    const qCode = question_code ?? questionCode;
    const session = reqSession(request);
    const canSee = await canSeeAnswer(session, matchId);
    if (qCode) {
      const row = await repo.findByCode(matchId, qCode);
      if (!row) {
        throw new AppError(404, "Question not found");
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
        throw new AppError(404, "Match not found");
      }
      const session = reqSession(request);
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
        throw new AppError(404, "Match not found");
      }
      const session = reqSession(request);
      const canSee = await canSeeAnswer(session, matchId);
      const row = await repo.findByCode(matchId, questionCode);
      if (!row) {
        throw new AppError(404, "Question not found");
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
      const session = reqSession(request);
      const matchCode = raw.matchCode ?? raw.match_code ?? "";
      const questionCode = raw.questionCode ?? raw.question_code ?? "";
      if (!matchCode || !questionCode || !raw.content || !raw.answer) {
        throw new AppError(400, "matchCode, questionCode, content, answer required");
      }
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        throw new AppError(status, check.message ?? "Forbidden");
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
      const session = reqSession(request);
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        throw new AppError(status, check.message ?? "Forbidden");
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
        throw new AppError(400, "Nothing to update");
      }
      const row = await repo.findByCode(check.matchId, questionCode);
      if (!row) {
        throw new AppError(404, "Question not found");
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
      const session = reqSession(request);
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        throw new AppError(status, check.message ?? "Forbidden");
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

  app.delete(
    "/questions/:matchCode/:questionCode",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = reqSession(request);
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        throw new AppError(status, check.message ?? "Forbidden");
      }
      const deleted = await repo.softDeleteOne(check.matchId, questionCode);
      if (!deleted) {
        throw new AppError(404, "Question not found");
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

  app.post(
    "/questions/:matchCode/:questionCode/use",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { matchCode, questionCode } = request.params as {
        matchCode: string;
        questionCode: string;
      };
      const session = reqSession(request);
      const matchId = await resolveMatchId(app.valkey, matchCode);
      if (!matchId) {
        throw new AppError(404, "Match not found");
      }
      const scopes = getScopes(session);
      const isController =
        session.role === "admin" ||
        (isOperatorLike(session.role) && scopes.includes("controller"));
      if (!isController) {
        const role = await repo.findTournamentRole(session.userId, matchId);
        if (role !== "controller") {
          throw new AppError(403, "Controller only");
        }
      }
      const ok = await repo.markUsed(matchId, questionCode);
      if (!ok) {
        throw new AppError(404, "Question not found");
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

  app.get(
    "/bank/search",
    {
      preHandler: async (request, reply) => {
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
      const session = reqSession(request);
      const canSee =
        session?.role === "admin" ||
        (isOperatorLike(session?.role) &&
          getScopes(session ?? {}).includes("qauthor"));
      const pageSize = clampLimit(limit, 20);
      const pageNum = clampPage(page);
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

  function normalizeCitations(raw: unknown): { source: string; url: string; accessedAt: string }[] | null {
    if (raw === undefined) return null;
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 3).map((c) => {
      const item = (c ?? {}) as Record<string, unknown>;
      let at = String(item.accessedAt ?? item.accessed_at ?? "").trim();
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(at);
      if (m) at = `${m[3]}-${m[2]}-${m[1]}`;
      return {
        source: String(item.source ?? "").trim(),
        url: String(item.url ?? "").trim(),
        accessedAt: at,
      };
    }).filter((c) => c.source || c.url);
  }
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
  app.post(
    "/questions/pick",
    {
      preHandler: async (request, reply) => {
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
      const session = reqSession(request);
      const matchCode = raw.matchCode ?? raw.match_code ?? "";
      const round = String(raw.round ?? "").trim().toUpperCase();
      if (!matchCode || !round) {
        throw new AppError(400, "matchCode and round required");
      }
      if (!/^[A-Z0-9_]{1,20}$/.test(round)) {
        throw new AppError(400, "round must be A-Z/0-9/_ (e.g. KD_C, GM, BP, VD)");
      }
      const actorCode = session?.userCode ?? null;
      if (!session) {
        throw new AppError(401, "Not authenticated");
      }
      const check = await canWriteQuestions(session, matchCode);
      if (!check.ok || !check.matchId) {
        const status = check.message === "Match not found" ? 404 : 403;
        throw new AppError(status, check.message ?? "Forbidden");
      }
      const matchId = (await canWriteQuestions(session, matchCode)).matchId;
      if (!matchId) {
        throw new AppError(404, "Match not found");
      }
      const bankId = raw.bankId ?? raw.bank_id ?? "";
      const bankCode = raw.bankCode ?? raw.bank_code ?? "";
      const ocPrefix = ocPrefixFromCode(matchCode);
      if (round === "GM") {
        let setCode = String(raw.setCode ?? raw.set_code ?? "").trim().toUpperCase();
        if (!setCode) {
          if (!bankCode) {
            throw new AppError(400, "GM chỉ pick cả set: cần setCode (hoặc bankCode KEY)");
          }
          const keyRow = await bankRepo.findByCode(bankCode);
          if (!keyRow || keyRow.hintIndex !== "KEY" || !keyRow.setCode) {
            throw new AppError(404, "KEY row with set_code not found");
          }
          setCode = keyRow.setCode;
        }
        const setRows = await bankRepo.search({ setCode, status: "approved", limit: 100 });
        const byHint = new Map(setRows.map((r) => [r.hintIndex, r]));
        const order = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];
        const missing = order.filter((h) => !byHint.has(h));
        if (missing.length > 0) {
          throw new AppError(422, `GM set ${setCode} incomplete, missing ${missing.join(",")}`);
        }
        const slots = order.map((h) => (h === "KEY" ? "GM_KEY" : `GM_${h}`));
        for (const s of slots) {
          const taken = await repo.findBySlot(matchId, s);
          if (taken) {
            throw new AppError(409, `slot ${s} already filled by ${taken.questionCode}`);
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
            citations: setRow.citations,
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
        throw new AppError(400, "bankId or bankCode required");
      }
      const bankRow = bankId
        ? await bankRepo.findById(bankId)
        : await bankRepo.findByCode(bankCode);
      if (!bankRow) {
        throw new AppError(404, "Bank question not found");
      }
      if (bankRow.status !== "approved") {
        throw new AppError(422, `Bank question is ${bankRow.status}, only approved rows can be picked`);
      }
      const slot = String(raw.slot ?? "").trim().toUpperCase() || null;
      if (slot) {
        const pattern = SLOT_PATTERNS[round];
        if (!pattern || !pattern.test(slot)) {
          throw new AppError(400, `slot ${slot} invalid for round ${round}`);
        }
        const taken = await repo.findBySlot(matchId, slot);
        if (taken) {
          throw new AppError(409, `slot ${slot} already filled by ${taken.questionCode}`);
        }
        const slotErr = matchSlotToRow(round, slot, bankRow);
        if (slotErr) {
          throw new AppError(422, slotErr);
        }
      }
      if (round === "GM") {
        throw new AppError(422, "GM chỉ pick cả set: cần setCode (hoặc bankCode KEY)");
      }
      const suffix = `${Date.now().toString(36).toUpperCase()}`;
      const questionCode = makeQuestionCode(
        ocPrefix.replace(/^OC/, ""),
        `${round}_${suffix}`,
      );
      const existing = await repo.findByCode(matchId, questionCode);
      if (existing) {
        throw new AppError(409, "Generated question code collided, retry");
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
        citations: bankRow.citations,
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
      isOperatorLike(session.role) && getScopes(session).includes("qauthor")
    );
  }

  app.post(
    "/bank",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request);
      if (!isBankWriter(session)) {
        throw new AppError(403, "Only admin or qauthor can write bank");
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
        citations?: unknown;
      };
      const bankCode = String(raw.bankCode ?? "").trim().toUpperCase();
      if (!/^QB_[A-Z0-9_]{1,20}$/.test(bankCode)) {
        throw new AppError(400, "bankCode must match QB_* (A-Z/0-9/_, max 20 chars)");
      }
      if (!raw.content?.trim() || !raw.answer?.trim()) {
        throw new AppError(400, "content and answer required");
      }
      const options = Array.isArray(raw.options)
        ? JSON.stringify(raw.options)
        : typeof raw.options === "string"
          ? raw.options
          : null;
      const roundHint =
        (raw.roundHint ?? raw.round_hint)?.trim().toUpperCase() || null;
      const hintIndex =
        (raw.hintIndex ?? raw.hint_index)?.trim().toUpperCase() || null;
      let setCode =
        (raw.setCode ?? raw.set_code)?.trim().toUpperCase() || null;
      if (!setCode && roundHint === "GM" && hintIndex === "KEY") {
        setCode = nextSequentialSetCode(
          await bankRepo.listCodesByPrefix("S"),
        );
      }
      try {
        const result = await bankRepo.create({
          bankCode,
          content: raw.content.trim(),
          answer: raw.answer.trim(),
          explanation: raw.explanation?.trim() || null,
          hintText: (raw.hintText ?? raw.hint_text)?.trim() || null,
          mediaUrl: (raw.mediaUrl ?? raw.media_url)?.trim() || null,
          options,
          roundHint,
          domain: raw.domain?.trim().toUpperCase() || null,
          difficulty: raw.difficulty ?? null,
          setCode,
          hintIndex,
          citations: normalizeCitations(raw.citations) ?? [],
          createdBy: uuidOrNull(session.userId),
        });
        emitBankChanged();
        return reply.code(201).send({
          status: "success",
          message: "Bank question created",
          data: { id: result.id, bankCode },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Create failed";
        const code = /unique|duplicate/i.test(msg) ? 409 : 400;
        throw new AppError(code, msg);
      }
    },
  );

  app.post(
    "/bank/import",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request);
      if (!isBankWriter(session)) {
        throw new AppError(403, "Only admin or qauthor can write bank");
      }

      const body = request.body as { items?: unknown; rows?: unknown };
      let items: RawItem[] = [];
      if (Array.isArray(body.items)) {
        items = body.items.slice(0, MAX_IMPORT_ROWS).map((it, i) => {
          const o = (it ?? {}) as Partial<RawItem>;
          return {
            sheet: typeof o.sheet === "string" ? o.sheet : undefined,
            row: Number(o.row) || i + 1,
            cells:
              o.cells && typeof o.cells === "object"
                ? (o.cells as Record<string, unknown>)
                : {},
          };
        });
      } else if (Array.isArray(body.rows)) {
        items = body.rows.slice(0, MAX_IMPORT_ROWS).map((r, i) => ({
          row: i + 1,
          cells:
            r && typeof r === "object"
              ? (r as Record<string, unknown>)
              : {},
        }));
      } else {
        throw new AppError(400, `items (raw Excel) hoặc rows (field-name) required, tối đa ${MAX_IMPORT_ROWS} dòng`);
      }
      if (items.length === 0) {
        throw new AppError(400, "Không có dòng nào để import");
      }

      const { rows, issues } = normalizeRows(items);
      const key = (r: { row: number; sheet?: string }) =>
        `${r.sheet ?? ""}#${r.row}`;

      const normalizeByKey = new Map<string, RowIssue[]>();
      for (const is of issues) {
        const k = `${is.sheet ?? ""}#${is.row}`;
        normalizeByKey.set(k, [...(normalizeByKey.get(k) ?? []), is]);
      }
      for (const is of validateGmSets(rows)) {
        const k = `${is.sheet ?? ""}#${is.row}`;
        normalizeByKey.set(k, [...(normalizeByKey.get(k) ?? []), is]);
      }

      type Result = {
        row: number;
        sheet?: string;
        status: "created" | "failed";
        bankCode?: string;
        errors?: Array<{ field?: string; msg: string }>;
      };
      const results: Result[] = [];
      const valid: typeof rows = [];
      const reported = new Set<string>();

      for (const r of rows) {
        reported.add(key(r));
        const errs = [...(normalizeByKey.get(key(r)) ?? []), ...validateRow(r)];
        if (errs.length > 0) {
          results.push({
            row: r.row,
            sheet: r.sheet,
            status: "failed",
            errors: errs.map((e) => ({ field: e.field, msg: e.msg })),
          });
        } else {
          valid.push(r);
        }
      }
      for (const [k, errs] of normalizeByKey) {
        if (reported.has(k)) continue;
        results.push({
          row: errs[0].row,
          sheet: errs[0].sheet,
          status: "failed",
          errors: errs.map((e) => ({ field: e.field, msg: e.msg })),
        });
      }

      const missing = valid.filter((r) => !r.fields.bankCode);
      if (missing.length > 0) {
        const today = vnDate();
        const existing: string[] = [];
        for (const prefix of autoCodePrefixes(missing, today)) {
          existing.push(...(await bankRepo.listCodesByPrefix(prefix)));
        }
        assignAutoCodes(missing, existing, today);
      }

      let created = 0;
      for (const r of valid) {
        try {
          await bankRepo.create({
            bankCode: r.fields.bankCode as string,
            content: (r.fields.content as string).trim(),
            answer: (r.fields.answer as string).trim(),
            explanation: r.fields.explanation?.trim() || null,
            hintText: r.fields.hintText?.trim() || null,
            mediaUrl: r.fields.mediaUrl ?? null,
            options: r.fields.options
              ? JSON.stringify(r.fields.options)
              : null,
            roundHint: r.fields.roundHint ?? null,
            domain: r.fields.domain ?? null,
            difficulty: r.fields.difficulty ?? null,
            setCode: r.fields.setCode ?? null,
            hintIndex: r.fields.hintIndex ?? null,
            citations: [],
            createdBy: uuidOrNull(session.userId),
          });
          created += 1;
          results.push({
            row: r.row,
            sheet: r.sheet,
            status: "created",
            bankCode: r.fields.bankCode,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Create failed";
          results.push({
            row: r.row,
            sheet: r.sheet,
            status: "failed",
            errors: [
              {
                field: "bankCode",
                msg: /unique|duplicate/i.test(msg)
                  ? `bankCode ${r.fields.bankCode} đã tồn tại`
                  : msg,
              },
            ],
          });
        }
      }

      if (created > 0) emitBankChanged();
      results.sort((a, b) => a.row - b.row);
      const warnings: MediaWarning[] = rows
        .map((r) => r.mediaWarning)
        .filter((w): w is MediaWarning => Boolean(w));

      return reply.send({
        status: "success",
        message: "OK",
        data: {
          total: items.length,
          created,
          failed: results.filter((r) => r.status === "failed").length,
          results,
          warnings,
        },
      });
    },
  );

  app.patch(
    "/bank/:id",
    {
      preHandler: async (request, reply) => {
        await requireAuth(app)(request, reply);
      },
    },
    async (request, reply) => {
      const session = reqSession(request);
      if (!session) {
        throw new AppError(401, "Not authenticated");
      }
      if (!isBankWriter(session)) {
        throw new AppError(403, "Only admin or qauthor can write bank");
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
        citations?: unknown;
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
        citations?: { source: string; url: string; accessedAt: string }[] | null;
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
      const normCites = normalizeCitations(raw.citations);
      if (normCites !== null) updates.citations = normCites;
      const before = await bankRepo.findById(id);
      const contentChanged = raw.content !== undefined || raw.answer !== undefined;
      const ok = await bankRepo.update(id, updates);
      if (!ok) {
        throw new AppError(404, "Bank question not found or nothing to update");
      }
      if (before?.status === "approved" && contentChanged) {
        await bankRepo.review(id, {
          status: "pending",
          reviewNote: "Tự động: nội dung thay đổi sau duyệt",
        });
      }
      void writeAudit({
        actionType: "QUESTION_USED",
        actorCode: session.userCode ?? null,
        targetCode: id,
        details: "bank updated",
      });
      emitBankChanged();
      return reply.send({
        status: "success",
        message: "Bank question updated",
        data: { id },
      });
    },
  );

  app.delete(
    "/bank/:id",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request);
      if (!isBankWriter(session)) {
        throw new AppError(403, "Only admin or qauthor can write bank");
      }
      const { id } = request.params as { id: string };
      const ok = await bankRepo.softDelete(id);
      if (!ok) {
        throw new AppError(404, "Bank question not found");
      }
      emitBankChanged();
      return reply.send({
        status: "success",
        message: "Bank question deleted",
        data: null,
      });
    },
  );

  app.post(
    "/bank/:id/review",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request);
      const canReview = session.role === "admin";
      if (!canReview) {
        throw new AppError(403, "Only admin can review bank");
      }
      const { id } = request.params as { id: string };
      const raw = request.body as { decision?: string; note?: string };
      const decision = String(raw.decision ?? "").trim().toLowerCase();
      if (decision !== "approved" && decision !== "rejected") {
        throw new AppError(400, "decision must be approved or rejected");
      }
      const note = String(raw.note ?? "").trim();
      if (decision === "rejected" && !note) {
        throw new AppError(400, "note required when rejecting");
      }
      const row = await bankRepo.findById(id);
      if (!row) {
        throw new AppError(404, "Bank question not found");
      }
      const ok = await bankRepo.review(id, {
        status: decision,
        reviewNote: note || null,
        reviewedBy: uuidOrNull(session.userId),
      });
      if (!ok) {
        throw new AppError(404, "Bank question not found");
      }
      emitBankChanged();
      return reply.send({
        status: "success",
        message: `Bank question ${decision}`,
        data: { id, status: decision },
      });
    },
  );
}
