import type { FastifyInstance } from "fastify";
import { requireAuth, requireScope } from "../auth/auth.service.js";
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

const OPTIONS = ["A", "B", "C", "D", "E", "F"] as const;

// 16 cau mau — mirror migrations/003_seed_qualifier.sql.
// POST /qualifier/:code/seed inserts missing VL_01..VL_16 (idempotent).
const SEED_QUESTIONS: Array<{
  questionCode: string;
  content: string;
  options: string[];
  correctOption: string;
  explanation: string;
  position: number;
}> = [
  { questionCode: "VL_01", content: "Thủ đô của Việt Nam là thành phố nào?", options: ["Hà Nội", "Huế", "Đà Nẵng", "TP. Hồ Chí Minh"], correctOption: "A", explanation: "Thủ đô từ năm 1976.", position: 1 },
  { questionCode: "VL_02", content: "2 + 2 x 3 bằng bao nhiêu?", options: ["6", "8", "10", "12"], correctOption: "B", explanation: "Nhân trước cộng sau.", position: 2 },
  { questionCode: "VL_03", content: "Nguyên tố có ký hiệu O là gì?", options: ["Vàng", "Oxy", "Bạc", "Sắt"], correctOption: "B", explanation: "Số nguyên tử 8.", position: 3 },
  { questionCode: "VL_04", content: "Tác giả Truyện Kiều là ai?", options: ["Hồ Xuân Hương", "Nguyễn Trãi", "Nguyễn Du", "Cao Bá Quát"], correctOption: "C", explanation: "Đại thi hào dân tộc.", position: 4 },
  { questionCode: "VL_05", content: "Sông dài nhất Việt Nam?", options: ["Sông Hồng", "Sông Mekong", "Sông Đồng Nai", "Sông Cả"], correctOption: "C", explanation: "Khoảng 586 km.", position: 5 },
  { questionCode: "VL_06", content: "Hành tinh gần Mặt Trời nhất?", options: ["Sao Kim", "Trái Đất", "Sao Thủy", "Sao Hỏa"], correctOption: "C", explanation: "Mercury.", position: 6 },
  { questionCode: "VL_07", content: "Đạo hàm của x^2 là gì?", options: ["x", "2x", "x^2", "2"], correctOption: "B", explanation: "Công thức cơ bản.", position: 7 },
  { questionCode: "VL_08", content: "Quá trình cây xanh tạo oxy gọi là gì?", options: ["Hô hấp", "Quang hợp", "Thoát hơi nước", "Thụ phấn"], correctOption: "B", explanation: "Photosynthesis.", position: 8 },
  { questionCode: "VL_09", content: "Hiến pháp Việt Nam hiện hành ban hành năm nào?", options: ["1992", "2001", "2013", "2015"], correctOption: "C", explanation: "Hiến pháp 2013.", position: 9 },
  { questionCode: "VL_10", content: "SEA Games 31 tổ chức ở quốc gia nào?", options: ["Thái Lan", "Việt Nam", "Indonesia", "Philippines"], correctOption: "B", explanation: "Hà Nội 2022.", position: 10 },
  { questionCode: "VL_11", content: "Số nguyên tố nhỏ nhất là số nào?", options: ["0", "1", "2", "3"], correctOption: "C", explanation: "Số 2.", position: 11 },
  { questionCode: "VL_12", content: "Đại dương lớn nhất thế giới?", options: ["Đại Tây Dương", "Ấn Độ Dương", "Bắc Băng Dương", "Thái Bình Dương"], correctOption: "D", explanation: "Pacific.", position: 12 },
  { questionCode: "VL_13", content: "Năm nhuận có bao nhiêu ngày?", options: ["365", "366", "364", "367"], correctOption: "B", explanation: "Tháng 2 có 29 ngày.", position: 13 },
  { questionCode: "VL_14", content: "Đơn vị đo cường độ dòng điện?", options: ["Volt", "Watt", "Ampere", "Ohm"], correctOption: "C", explanation: "Ký hiệu A.", position: 14 },
  { questionCode: "VL_15", content: "Châu lục nhỏ nhất thế giới?", options: ["Châu Âu", "Châu Úc", "Nam Cực", "Nam Mỹ"], correctOption: "B", explanation: "Oceania.", position: 15 },
  { questionCode: "VL_16", content: "Ngôn ngữ lập trình nào chạy trên trình duyệt?", options: ["Python", "JavaScript", "C++", "Rust", "Go"], correctOption: "B", explanation: "JS là ngôn ngữ web.", position: 16 },
];

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
      session.role === "operator" && getScopes(session).includes("qauthor")
    );
  }

  async function resolveTournament(code: string) {
    const t = await repo.findTournamentByCode(code);
    return t;
  }

  // GET /qualifier/:tournamentCode/questions — list 16 questions (position order).
  // Answer hidden unless qauthor/admin.
  app.get(
    "/qualifier/:tournamentCode/questions",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const session = (request as unknown as { session: { role: string; operatorScopes?: string | null } }).session;
      const rows = await repo.listQuestions(t.id);
      return reply.send({
        status: "success",
        message: "OK",
        data: rows.map((r) => stripQualifierAnswer(r, isQAuthor(session))),
      });
    },
  );

  // POST /qualifier/:tournamentCode/questions — qauthor creates one (position 1-16).
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
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      if (!raw.questionCode || !raw.content) {
        return reply.code(400).send({
          status: "error",
          message: "questionCode, content required",
          data: null,
        });
      }
      if (!validateOptions(raw.options)) {
        return reply.code(400).send({
          status: "error",
          message: "options must be 4-6 non-empty strings",
          data: null,
        });
      }
      if (!validateOptionLetter(raw.correctOption)) {
        return reply.code(400).send({
          status: "error",
          message: "correctOption must be one of A-F",
          data: null,
        });
      }
      const idx = (OPTIONS as readonly string[]).indexOf(raw.correctOption);
      if (idx >= raw.options.length) {
        return reply.code(400).send({
          status: "error",
          message: "correctOption exceeds options length",
          data: null,
        });
      }
      const position = Number(raw.position ?? 0);
      if (!Number.isInteger(position) || position < 1 || position > 16) {
        return reply.code(400).send({
          status: "error",
          message: "position must be integer 1-16",
          data: null,
        });
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
        const session = (request as unknown as { session: { userCode?: string } }).session;
        void writeAudit({
          actionType: "MATCH_CREATED",
          actorCode: session?.userCode ?? null,
          matchCode: tournamentCode,
          targetCode: raw.questionCode,
          details: "qualifier question created",
        });
        // Realtime: player pages in qualifier_<CODE> room refresh list.
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
        return reply.code(code).send({
          status: "error",
          message: msg,
          data: null,
        });
      }
    },
  );

  // PATCH /qualifier/:tournamentCode/questions/:questionCode — qauthor edits open question.
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
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      if (q.status !== "open") {
        return reply.code(400).send({
          status: "error",
          message: "Closed question cannot be edited",
          data: null,
        });
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
          return reply.code(400).send({
            status: "error",
            message: "options must be 4-6 non-empty strings",
            data: null,
          });
        }
        updates.options = raw.options.map((o) => o.trim());
      }
      if (raw.correctOption !== undefined) {
        if (!validateOptionLetter(raw.correctOption)) {
          return reply.code(400).send({
            status: "error",
            message: "correctOption must be one of A-F",
            data: null,
          });
        }
        updates.correctOption = raw.correctOption;
      }
      if (raw.explanation !== undefined) updates.explanation = raw.explanation;
      if (raw.mediaUrl !== undefined) updates.mediaUrl = raw.mediaUrl;
      if (raw.position !== undefined) {
        const p = Number(raw.position);
        if (!Number.isInteger(p) || p < 1 || p > 16) {
          return reply.code(400).send({
            status: "error",
            message: "position must be integer 1-16",
            data: null,
          });
        }
        updates.position = p;
      }
      const ok = await repo.updateQuestion(q.id, updates);
      if (!ok) {
        return reply.code(400).send({
          status: "error",
          message: "Nothing to update",
          data: null,
        });
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

  // DELETE /qualifier/:tournamentCode/questions/:questionCode — qauthor soft-deletes.
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
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      const ok = await repo.softDeleteQuestion(q.id);
      if (!ok) {
        return reply.code(400).send({
          status: "error",
          message: "Delete failed",
          data: null,
        });
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

  // POST /qualifier/:tournamentCode/questions/:questionCode/attempt — player submits.
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
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      if (!validateOptionLetter(raw.selectedOption)) {
        return reply.code(400).send({
          status: "error",
          message: "selectedOption must be one of A-F",
          data: null,
        });
      }
      const ms = Number(raw.responseTimeMs ?? 0);
      if (!Number.isFinite(ms) || ms < 0) {
        return reply.code(400).send({
          status: "error",
          message: "responseTimeMs must be >= 0",
          data: null,
        });
      }
      // Moi cau 10s: qua gio → 400, tinh nhu bo qua (khong ghi attempt).
      if (isQualifierTimeout(ms)) {
        return reply.code(400).send({
          status: "error",
          message: `Time limit ${QUALIFIER_TIME_LIMIT_MS}ms exceeded`,
          data: null,
        });
      }
      const session = (request as unknown as { session: { userId: string } }).session;
      try {
        await repo.submitAttempt({
          questionId: q.id,
          playerId: session.userId,
          selectedOption: raw.selectedOption,
          responseTimeMs: Math.round(ms),
        });
        // Do not reveal correctness before close.
        return reply.code(201).send({
          status: "success",
          message: "Attempt recorded",
          data: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Submit failed";
        const code = msg === "Question closed" ? 400 : 400;
        return reply.code(code).send({
          status: "error",
          message: msg,
          data: null,
        });
      }
    },
  );

  // POST /qualifier/:tournamentCode/questions/:questionCode/close — qauthor/controller
  // freezes + scores (controller allowed for live ops).
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
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const q = await repo.findQuestion(t.id, questionCode);
      if (!q) {
        return reply.code(404).send({
          status: "error",
          message: "Question not found",
          data: null,
        });
      }
      if (q.status === "closed") {
        return reply.code(400).send({
          status: "error",
          message: "Already closed",
          data: null,
        });
      }
      const n = await repo.countMembers(t.id);
      const result = await repo.closeAndScore(q.id, n);
      const session = (request as unknown as { session: { userCode?: string } }).session;
      void writeAudit({
        actionType: "MATCH_STATE_CHANGE",
        actorCode: session?.userCode ?? null,
        matchCode: tournamentCode,
        targetCode: questionCode,
        details: `qualifier closed X=${result.correctCount} Y=${result.wrongCount} Z=${result.noAnswerCount}`,
      });
      // Realtime: players refresh list + standings (correctness now visible).
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

  // GET /qualifier/:tournamentCode/standings?limit=16 — top-N ranking.
  app.get(
    "/qualifier/:tournamentCode/standings",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const { limit } = request.query as { limit?: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const n = Math.min(Math.max(Number(limit ?? 16) || 16, 1), 100);
      const rows = await repo.standings(t.id, n);
      return reply.send({
        status: "success",
        message: "OK",
        data: rows,
      });
    },
  );

  // POST /qualifier/:tournamentCode/seed — qauthor inserts missing VL_01..VL_16.
  // Idempotent: skips codes already present. Controller scope also allowed
  // so live ops can bootstrap a tournament without QAuthor login.
  app.post(
    "/qualifier/:tournamentCode/seed",
    { preHandler: [requireScope(app, "qauthor", "controller")] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const existing = await repo.listQuestions(t.id);
      const have = new Set(existing.map((q) => q.questionCode));
      let created = 0;
      for (const s of SEED_QUESTIONS) {
        if (have.has(s.questionCode)) continue;
        try {
          await repo.createQuestion({
            tournamentId: t.id,
            questionCode: s.questionCode,
            content: s.content,
            options: s.options,
            correctOption: s.correctOption,
            explanation: s.explanation,
            position: s.position,
          });
          created++;
        } catch {
          /* unique race — treat as existing */
        }
      }
      const session = (request as unknown as { session: { userCode?: string } }).session;
      void writeAudit({
        actionType: "MATCH_CREATED",
        actorCode: session?.userCode ?? null,
        matchCode: tournamentCode,
        details: `qualifier seeded ${created} questions`,
      });
      void manager.broadcast(`qualifier_${tournamentCode}`, {
        type: "qualifier_opened",
        tournament_code: tournamentCode,
        seeded: created,
      });
      return reply.code(201).send({
        status: "success",
        message: `Seeded ${created} questions`,
        data: { created },
      });
    },
  );

  // POST /qualifier/:tournamentCode/close-all — qauthor/controller closes
  // every open question (zero-sum each) for live ops. Skips already closed.
  app.post(
    "/qualifier/:tournamentCode/close-all",
    { preHandler: [requireScope(app, "qauthor", "controller")] },
    async (request, reply) => {
      const { tournamentCode } = request.params as { tournamentCode: string };
      const t = await resolveTournament(tournamentCode);
      if (!t) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
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
      const session = (request as unknown as { session: { userCode?: string } }).session;
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
