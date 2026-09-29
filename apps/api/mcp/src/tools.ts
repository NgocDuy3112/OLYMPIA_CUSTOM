import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiFetch, toToolText } from "./api.js";

const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: toToolText(payload) }],
});

type Shape = Record<string, z.ZodTypeAny>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function reg(
  server: McpServer,
  name: string,
  desc: string,
  shape: Shape,
  handler: Handler,
): void {
  server.registerTool(name, { description: desc, inputSchema: shape }, handler);
}

/** Gỡ hết gating: mọi tool đăng ký cho mọi token hợp lệ —
 *  quyền do backend chốt theo identity (role operator/admin lúc mint). */
export function registerTools(server: McpServer): void {
  // ── Read ──

  reg(server, "list_matches",
    "Liệt kê matches. Filter theo tournamentCode nếu có. (GET /api/matches, public)",
    { tournamentCode: z.string().optional().describe("Mã giải, vd OC_T_...") },
    async ({ tournamentCode }) => {
      const data = await apiFetch("/api/matches", {
        query: { tournamentCode },
      });
      return text(data);
    },
  );

  reg(server, "get_match",
    "Chi tiết 1 match + players theo slug/code. (GET /api/matches/:slug, public)",
    { slug: z.string().describe("matchSlug hoặc matchCode") },
    async ({ slug }) => {
      const data = await apiFetch(`/api/matches/${encodeURIComponent(slug)}`);
      return text(data);
    },
  );

  reg(server, "get_scoreboard",
    "Bảng điểm của match. (GET /api/scoreboard/:matchCode, public)",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/scoreboard/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, "list_questions",
    "Danh sách câu hỏi của match. Cần login (sid). Non-staff bị strip answer/explanation.",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/questions/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, "get_question",
    "Chi tiết 1 câu hỏi. Cần login. Non-staff bị strip answer/explanation.",
    { matchCode: z.string(), questionCode: z.string() },
    async ({ matchCode, questionCode }) => {
      const data = await apiFetch(
        `/api/questions/${encodeURIComponent(matchCode)}/${encodeURIComponent(questionCode)}`,
      );
      return text(data);
    },
  );

  reg(server, "list_answers",
    "Đáp án thí sinh trong match. Cần login. Staff thấy all, player chỉ thấy bài mình.",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/answers/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, "get_question_answers",
    "Đáp án thí sinh cho 1 câu. Staff-only (API trả 403 nếu không phải staff). Controller dùng để HIỆN TRẢ LỜI.",
    { matchCode: z.string(), questionCode: z.string() },
    async ({ matchCode, questionCode }) => {
      const data = await apiFetch(
        `/api/answers/${encodeURIComponent(matchCode)}/${encodeURIComponent(questionCode)}`,
      );
      return text(data);
    },
  );

  reg(server, "search_bank",
    "Tìm ngân hàng câu hỏi. Cần login hoặc agent token. Non-qauthor bị ẩn answer.",
    {
      q: z.string().optional(),
      round_hint: z.string().optional(),
      domain: z.string().optional(),
      difficulty: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      page: z.number().min(1).default(1),
    },
    async ({ q, round_hint, domain, difficulty, limit, page }) => {
      const data = await apiFetch("/api/bank/search", {
        query: { q, round_hint, domain, difficulty, limit, page },
      });
      return text(data);
    },
  );

  reg(server, "list_tournaments",
    "Liệt kê giải đấu. (GET /api/tournaments, public)",
    {},
    async () => {
      const data = await apiFetch("/api/tournaments");
      return text(data);
    },
  );

  reg(server, "get_tournament",
    "Chi tiết giải + players + matches. (GET /api/tournaments/:code, public)",
    { code: z.string() },
    async ({ code }) => {
      const data = await apiFetch(
        `/api/tournaments/${encodeURIComponent(code)}`,
      );
      return text(data);
    },
  );

  reg(server, "get_standings",
    "Bảng xếp hạng giải. (GET /api/tournaments/:code/standings, public)",
    { code: z.string() },
    async ({ code }) => {
      const data = await apiFetch(
        `/api/tournaments/${encodeURIComponent(code)}/standings`,
      );
      return text(data);
    },
  );

  reg(server, "grade_question",
    "Chấm toàn bộ bài 1 câu (backend tự lấy đáp án gốc + bài thí sinh rồi chấm). Staff-only. Mặc định ẩn danh TS1..n (anonymize=false để hiện userCode).",
    {
      matchCode: z.string(),
      questionCode: z.string(),
      mode: z.enum(["auto", "mcq"]).default("auto"),
      anonymize: z.boolean().default(true),
    },
    async ({ matchCode, questionCode, mode, anonymize }) => {
      const data = await apiFetch("/api/grade/question", {
        method: "POST",
        body: { match_code: matchCode, question_code: questionCode, mode, anonymize },
      });
      return text(data);
    },
  );

  // ── Write (API vẫn enforce role, thiếu quyền → 401/403) ──

  reg(server, "bank_create",
    "Thêm câu vào bank. Cần quyền qauthor (admin/operator-qauthor). bankCode format QB_[A-Z0-9_].",
    {
      bankCode: z.string().regex(/^QB_[A-Z0-9_]{1,20}$/),
      content: z.string().min(1),
      answer: z.string().min(1),
      explanation: z.string().optional(),
      hintText: z.string().optional(),
      mediaUrl: z.string().optional(),
      roundHint: z.string().optional(),
      domain: z.string().optional(),
      difficulty: z.string().optional(),
      setCode: z.string().optional(),
    },
    async (args) => {
      const data = await apiFetch("/api/bank", { method: "POST", body: args });
      return text(data);
    },
  );
}
