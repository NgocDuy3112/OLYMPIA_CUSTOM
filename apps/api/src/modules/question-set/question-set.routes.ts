import type { FastifyInstance } from "fastify";
import { requireAuth, requireScope } from "../auth/auth.service.js";
import { resolveMatchId } from "../../state/id-cache.js";
import { writeAudit } from "../audit/audit.service.js";
import { drizzleQuestionRepo } from "../question/question.repo.js";
import { drizzleBankRepo } from "../question/bank.repo.js";
import { makeQuestionCode, ocPrefixFromCode } from "@oc/shared";
import {
  drizzleQuestionSetRepo,
  type QuestionSetRepo,
} from "./question-set.repo.js";
import {
  SET_ROUNDS,
  expectedSlotCount,
  missingSlots,
  roundOfSlot,
  totalExpectedSlots,
  type SetRound,
} from "./slots.js";

interface Session {
  userId: string;
  role: string;
  operatorScopes?: string | null;
  userCode?: string;
}

function canEditSets(session: Session): boolean {
  if (session.role === "admin") return true;
  if (session.role !== "operator") return false;
  return (session.operatorScopes ?? "").split(",").map((s) => s.trim()).includes("qauthor");
}

function err(reply: import("fastify").FastifyReply, code: number, message: string) {
  return reply.code(code).send({ status: "error", message, data: null });
}

function ok(reply: import("fastify").FastifyReply, code: number, message: string, data: unknown) {
  return reply.code(code).send({ status: "success", message, data });
}

const GM_ORDER = ["KEY", "H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];
const gmSlotOf = (h: string): string => (h === "KEY" ? "GM_KEY" : `GM_${h}`);

export async function questionSetRoutes(
  app: FastifyInstance,
  opts: { repo?: QuestionSetRepo } = {},
) {
  const repo = opts.repo ?? drizzleQuestionSetRepo;
  const questions = drizzleQuestionRepo;
  const bank = drizzleBankRepo;

  const needSet = async (setCode: string) => repo.findByCode(setCode.toUpperCase());

  // GET /question-sets?matchCode= — list (auth).
  app.get("/question-sets", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const { matchCode } = request.query as { matchCode?: string };
    const rows = await repo.list(matchCode?.trim().toUpperCase() || undefined);
    const data = await Promise.all(
      rows.map(async (s) => {
        const items = await repo.listItems(s.id);
        return { ...s, filled: items.length, expected: totalExpectedSlots() };
      }),
    );
    return ok(reply, 200, "OK", data);
  });

  // POST /question-sets — tạo bộ (qauthor/admin).
  app.post("/question-sets", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can create sets");
    const body = request.body as { setName?: unknown; matchCode?: unknown };
    const setName = typeof body.setName === "string" ? body.setName.trim().slice(0, 100) : "";
    if (!setName) return err(reply, 400, "setName required");
    const matchCode =
      typeof body.matchCode === "string" && body.matchCode.trim()
        ? body.matchCode.trim().toUpperCase()
        : null;
    const setCode = `BD_${Date.now().toString(36).toUpperCase()}`;
    const created = await repo.create({ setCode, setName, matchCode });
    return ok(reply, 201, "Question set created", created);
  });

  // GET /question-sets/:code — chi tiết + items + tiến độ (auth).
  app.get("/question-sets/:code", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    const items = await repo.listItems(set.id);
    const rounds = SET_ROUNDS.map((r) => {
      const missing = missingSlots(r, items.filter((i) => i.round === r).map((i) => i.slot));
      return { round: r, expected: expectedSlotCount(r), filled: expectedSlotCount(r) - missing.length, missing };
    });
    // Kèm nội dung bank để UI bảng hiển thị (không cần gọi thêm).
    const enriched = await Promise.all(
      items.map(async (i) => {
        const b = await bank.findByCode(i.bankCode);
        return {
          ...i,
          content: b?.content ?? "",
          answer: b?.answer ?? "",
          bankMissing: !b || b.status !== "approved",
        };
      }),
    );
    return ok(reply, 200, "OK", { ...set, items: enriched, rounds });
  });

  // PATCH /question-sets/:code — đổi tên/gán trận (draft only).
  app.patch("/question-sets/:code", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can edit sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Only draft sets can be edited (reopen first)");
    const body = request.body as { setName?: unknown; matchCode?: unknown };
    const updates: { setName?: string; matchCode?: string | null } = {};
    if (typeof body.setName === "string" && body.setName.trim()) {
      updates.setName = body.setName.trim().slice(0, 100);
    }
    if (body.matchCode !== undefined) {
      updates.matchCode =
        typeof body.matchCode === "string" && body.matchCode.trim()
          ? body.matchCode.trim().toUpperCase()
          : null;
    }
    const updated = await repo.update(set.id, updates);
    return ok(reply, 200, "Question set updated", updated);
  });

  // DELETE /question-sets/:code — xoá bộ draft.
  app.delete("/question-sets/:code", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can delete sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Only draft sets can be deleted");
    await repo.remove(set.id);
    return ok(reply, 200, "Question set deleted", null);
  });

  // POST /question-sets/:code/items — nhét 1 câu bank vào slot (KĐ/BP/VĐ).
  app.post("/question-sets/:code/items", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can fill sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Only draft sets can be edited (reopen first)");
    const body = request.body as { round?: unknown; slot?: unknown; bankCode?: unknown };
    const slot = typeof body.slot === "string" ? body.slot.trim().toUpperCase() : "";
    const round = typeof body.round === "string" ? body.round.trim().toUpperCase() : "";
    const bankCode = typeof body.bankCode === "string" ? body.bankCode.trim() : "";
    if (!slot || !round || !bankCode) return err(reply, 400, "round, slot, bankCode required");
    const slotRound = roundOfSlot(slot);
    if (!slotRound) return err(reply, 400, `slot ${slot} invalid`);
    if (slotRound !== (round as SetRound)) {
      return err(reply, 400, `slot ${slot} belongs to ${slotRound}, not ${round}`);
    }
    if (slotRound === "GM") {
      return err(reply, 422, "GM chỉ pick cả set: dùng pick-gm-set");
    }
    const bankRow = await bank.findByCode(bankCode);
    if (!bankRow) return err(reply, 404, "Bank question not found");
    if (bankRow.status !== "approved") {
      return err(reply, 422, `Bank question is ${bankRow.status}, only approved rows can be picked`);
    }
    if (slotRound === "VD") {
      const m = /^VD_([A-Z]+)_(\d+)$/.exec(slot);
      if (m && (bankRow.domain !== m[1] || bankRow.difficulty !== Number(m[2]))) {
        return err(reply, 422, `slot ${slot} needs domain ${m[1]} level ${m[2]}`);
      }
    }
    const item = await repo.upsertItem(set.id, { round: slotRound, slot, bankCode: bankRow.bankCode });
    return ok(reply, 201, "Item added to set", item);
  });

  // POST /question-sets/:code/pick-gm-set — fill nguyên set GM (9 dòng).
  app.post("/question-sets/:code/pick-gm-set", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can fill sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Only draft sets can be edited (reopen first)");
    const body = request.body as { setCode?: unknown };
    const gmSetCode = typeof body.setCode === "string" ? body.setCode.trim().toUpperCase() : "";
    if (!gmSetCode) return err(reply, 400, "setCode required");
    const rows = await bank.search({ setCode: gmSetCode, status: "approved", limit: 100 });
    const byHint = new Map(rows.map((r) => [r.hintIndex, r]));
    const missing = GM_ORDER.filter((h) => !byHint.has(h));
    if (missing.length > 0) {
      return err(reply, 422, `GM set ${gmSetCode} incomplete, missing ${missing.join(",")}`);
    }
    const created: { slot: string; bankCode: string }[] = [];
    for (const h of GM_ORDER) {
      const r = byHint.get(h)!;
      const slot = gmSlotOf(h);
      await repo.upsertItem(set.id, { round: "GM", slot, bankCode: r.bankCode });
      created.push({ slot, bankCode: r.bankCode });
    }
    return ok(reply, 201, `GM set ${gmSetCode} added`, { setCode: gmSetCode, created });
  });

  // DELETE /question-sets/:code/items/:slot — gỡ 1 dòng.
  app.delete("/question-sets/:code/items/:slot", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can edit sets");
    const { code, slot } = request.params as { code: string; slot: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Only draft sets can be edited (reopen first)");
    await repo.removeItem(set.id, slot.toUpperCase());
    return ok(reply, 200, "Item removed", null);
  });

  // POST /question-sets/:code/ready — chốt đủ slot → ready.
  app.post("/question-sets/:code/ready", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can ready sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "draft") return err(reply, 400, "Set is not draft");
    const items = await repo.listItems(set.id);
    const lacking = SET_ROUNDS.flatMap((r) =>
      missingSlots(r, items.filter((i) => i.round === r).map((i) => i.slot)).map((s) => `${r}:${s}`),
    );
    if (lacking.length > 0) {
      return err(reply, 422, `Thiếu ${lacking.length} slot: ${lacking.slice(0, 10).join(", ")}${lacking.length > 10 ? "…" : ""}`);
    }
    const updated = await repo.update(set.id, { status: "ready" });
    return ok(reply, 200, "Set ready", updated);
  });

  // POST /question-sets/:code/reopen — mở lại bộ ready để sửa.
  app.post("/question-sets/:code/reopen", { preHandler: [requireAuth(app)] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    if (!canEditSets(session)) return err(reply, 403, "Only admin or qauthor can reopen sets");
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "ready") return err(reply, 400, "Only ready sets can be reopened");
    const updated = await repo.update(set.id, { status: "draft" });
    return ok(reply, 200, "Set reopened to draft", updated);
  });

  // POST /question-sets/:code/activate — copy bộ vào trận (controller/admin).
  // Ghi đè toàn bộ câu hỏi hiện tại của trận bằng nội dung bộ.
  app.post("/question-sets/:code/activate", { preHandler: [requireScope(app, "controller")] }, async (request, reply) => {
    const session = (request as unknown as { session: Session }).session;
    const { code } = request.params as { code: string };
    const set = await needSet(code);
    if (!set) return err(reply, 404, "Question set not found");
    if (set.status !== "ready") return err(reply, 400, "Only ready sets can be activated");
    const body = request.body as { matchCode?: unknown };
    const matchCode =
      (typeof body.matchCode === "string" && body.matchCode.trim()
        ? body.matchCode.trim().toUpperCase()
        : set.matchCode) ?? "";
    if (!matchCode) return err(reply, 400, "matchCode required (set chưa gán trận)");
    const matchId = await resolveMatchId(app.valkey, matchCode);
    if (!matchId) return err(reply, 404, "Match not found");
    const items = await repo.listItems(set.id);
    const lacking = SET_ROUNDS.flatMap((r) =>
      missingSlots(r, items.filter((i) => i.round === r).map((i) => i.slot)),
    );
    if (lacking.length > 0) return err(reply, 422, `Set thiếu ${lacking.length} slot, reopen để bổ sung`);
    // Validate bank trước khi xoá câu cũ.
    const bankRows = new Map<string, Awaited<ReturnType<typeof bank.findByCode>>>();
    for (const item of items) {
      const b = await bank.findByCode(item.bankCode);
      if (!b || b.status !== "approved") {
        return err(reply, 422, `Bank ${item.bankCode} không còn dùng được (xoá khỏi bộ rồi activate lại)`);
      }
      bankRows.set(item.bankCode, b);
    }
    await questions.softDeleteAll(matchId);
    const ocPrefix = ocPrefixFromCode(matchCode);
    const created: { slot: string; questionCode: string; bankCode: string }[] = [];
    for (const item of items) {
      const b = bankRows.get(item.bankCode)!;
      const suffix = `${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase()}`;
      const questionCode = makeQuestionCode(ocPrefix.replace(/^OC/, ""), `${item.round}_${suffix}`);
      await questions.create({
        matchId,
        questionCode,
        content: b.content,
        answer: b.answer,
        explanation: b.explanation ?? undefined,
        hintText: b.hintText ?? undefined,
        mediaUrl: b.mediaUrl ?? undefined,
        options: b.options ?? undefined,
        sourceBankId: b.id,
        slot: item.slot,
        citations: b.citations,
      });
      created.push({ slot: item.slot, questionCode, bankCode: b.bankCode });
    }
    await repo.clearActiveForMatch(matchCode, set.id);
    await repo.update(set.id, { activeMatchCode: matchCode });
    void writeAudit({
      actionType: "QUESTION_USED",
      actorCode: session?.userCode ?? null,
      matchCode,
      targetCode: set.setCode,
      details: `activated set ${set.setCode} (${created.length} questions)`,
    });
    return ok(reply, 200, `Đã kích hoạt ${set.setName} cho trận ${matchCode}`, {
      setCode: set.setCode,
      matchCode,
      created,
    });
  });
}
