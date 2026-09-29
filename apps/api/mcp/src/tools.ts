import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiFetch, toToolText } from "./api.js";

/** Scope cho từng tool. Agent token map tới tập scope trong env. */
export const SCOPES = ["read", "bank", "judge"] as const;
export type Scope = (typeof SCOPES)[number];

const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: toToolText(payload) }],
});

type Shape = Record<string, z.ZodTypeAny>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function reg(
  server: McpServer,
  allow: Set<string> | null,
  scope: Scope,
  name: string,
  desc: string,
  shape: Shape,
  handler: Handler,
): void {
  if (allow && !allow.has(scope)) return;
  server.registerTool(name, { description: desc, inputSchema: shape }, handler);
}

export function registerTools(server: McpServer, allow: Set<string> | null = null): void {
  // ── Read (scope: read) ──

  reg(server, allow, "read", "list_matches",
    "Liệt kê matches. Filter theo tournamentCode nếu có. (GET /api/matches, public)",
    { tournamentCode: z.string().optional().describe("Mã giải, vd OC_T_...") },
    async ({ tournamentCode }) => {
      const data = await apiFetch("/api/matches", {
        query: { tournamentCode },
      });
      return text(data);
    },
  );

  reg(server, allow, "read", "get_match",
    "Chi tiết 1 match + players theo slug/code. (GET /api/matches/:slug, public)",
    { slug: z.string().describe("matchSlug hoặc matchCode") },
    async ({ slug }) => {
      const data = await apiFetch(`/api/matches/${encodeURIComponent(slug)}`);
      return text(data);
    },
  );

  reg(server, allow, "read", "get_scoreboard",
    "Bảng điểm của match. (GET /api/scoreboard/:matchCode, public)",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/scoreboard/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "list_questions",
    "Danh sách câu hỏi của match. Cần login (sid). Non-staff bị strip answer/explanation.",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/questions/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "get_question",
    "Chi tiết 1 câu hỏi. Cần login. Non-staff bị strip answer/explanation.",
    { matchCode: z.string(), questionCode: z.string() },
    async ({ matchCode, questionCode }) => {
      const data = await apiFetch(
        `/api/questions/${encodeURIComponent(matchCode)}/${encodeURIComponent(questionCode)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "list_answers",
    "Đáp án thí sinh trong match. Cần login. Staff thấy all, player chỉ thấy bài mình.",
    { matchCode: z.string() },
    async ({ matchCode }) => {
      const data = await apiFetch(
        `/api/answers/${encodeURIComponent(matchCode)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "get_question_answers",
    "Đáp án thí sinh cho 1 câu. Staff-only (API trả 403 nếu không phải staff). Controller dùng để HIỆN TRẢ LỜI.",
    { matchCode: z.string(), questionCode: z.string() },
    async ({ matchCode, questionCode }) => {
      const data = await apiFetch(
        `/api/answers/${encodeURIComponent(matchCode)}/${encodeURIComponent(questionCode)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "search_bank",
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

  reg(server, allow, "read", "list_tournaments",
    "Liệt kê giải đấu. (GET /api/tournaments, public)",
    {},
    async () => {
      const data = await apiFetch("/api/tournaments");
      return text(data);
    },
  );

  reg(server, allow, "read", "get_tournament",
    "Chi tiết giải + players + matches. (GET /api/tournaments/:code, public)",
    { code: z.string() },
    async ({ code }) => {
      const data = await apiFetch(
        `/api/tournaments/${encodeURIComponent(code)}`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "get_standings",
    "Bảng xếp hạng giải. (GET /api/tournaments/:code/standings, public)",
    { code: z.string() },
    async ({ code }) => {
      const data = await apiFetch(
        `/api/tournaments/${encodeURIComponent(code)}/standings`,
      );
      return text(data);
    },
  );

  reg(server, allow, "read", "grade_question",
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

  reg(server, allow, "judge", "grade_llm",
    "LLM judge chấm tương đương ngữ nghĩa (paraphrase engine không bắt được, vd Sài Gòn vs TP.HCM). Gọi POST /api/agent/ask, cần sid qauthor/controller, rate-limit 10/phút. Engine đúng → khỏi gọi.",
    {
      candidate: z.string().describe("Đáp án thí sinh"),
      expected: z.string().describe("Đáp án gốc"),
      question: z.string().optional().describe("Nội dung câu hỏi làm context"),
      matchCode: z.string().optional().describe("Mã trận, trống = BANK_REVIEW"),
    },
    async ({ candidate, expected, question, matchCode }) => {
      const prompt = [
        "Bạn là giám khảo. Chỉ trả lời đúng 1 JSON: {\"correct\": true|false, \"reason\": \"<ngắn gọn>\"}.",
        `Câu hỏi: ${question?.trim() || "(không có)"}`,
        `Đáp án gốc: ${expected}`,
        `Bài thí sinh: ${candidate}`,
        "Đúng khi cùng thực thể/sự vật/giá trị, kể cả paraphrase, tên gọi khác, thứ tự từ khác.",
      ].join("\n");
      const res = (await apiFetch("/api/agent/ask", {
        method: "POST",
        body: { match_code: matchCode?.trim() || undefined, question: prompt },
      })) as { data?: { answer?: unknown; tools_used?: unknown } };
      const raw = typeof res.data?.answer === "string" ? res.data.answer : "";
      const m = raw.match(/\{[\s\S]*\}/);
      let verdict: unknown = null;
      if (m) {
        try {
          verdict = JSON.parse(m[0]);
        } catch {
          verdict = null;
        }
      }
      return text({
        verdict,
        parsed: verdict !== null,
        raw: raw.slice(0, 2000),
        tools_used: res.data?.tools_used ?? null,
      });
    },
  );

  // ── Write (API vẫn enforce role, thiếu quyền → 401/403) ──

  reg(server, allow, "bank", "bank_create",
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
