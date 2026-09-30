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
 *  quyền do backend chốt theo identity (role operator/admin lúc mint).
 *  Tool gộp theo intent: không identifier → list, có → detail (xem description). */
export function registerTools(server: McpServer): void {
  // ── Read ──

  reg(server, "match_overview",
    "Trạng thái trận đấu. Không slug → danh sách matches (lọc tournamentCode?). Có slug (matchSlug|matchCode) → chi tiết match + players; includeScoreboard=true → kèm bảng điểm. (GET /api/matches, /api/matches/:slug, /api/scoreboard/:matchCode)",
    {
      slug: z.string().optional().describe("matchSlug hoặc matchCode — trống = list"),
      tournamentCode: z.string().optional().describe("Mã giải filter khi list, vd OC_T_..."),
      includeScoreboard: z.boolean().default(false).describe("Kèm bảng điểm (chỉ khi có slug)"),
    },
    async ({ slug, tournamentCode, includeScoreboard }) => {
      if (!slug) {
        const data = await apiFetch("/api/matches", {
          query: { tournamentCode },
        });
        return text(data);
      }
      const detail = (await apiFetch(
        `/api/matches/${encodeURIComponent(slug)}`,
      )) as Record<string, unknown>;
      if (!includeScoreboard) return text(detail);
      const matchCode = (detail as { data?: { matchCode?: string } })?.data
        ?.matchCode;
      if (!matchCode) {
        return text({
          ...detail,
          scoreboard: null,
          note: "Không lấy được matchCode từ detail — bỏ qua scoreboard",
        });
      }
      const scoreboard = await apiFetch(
        `/api/scoreboard/${encodeURIComponent(matchCode)}`,
      );
      return text({ ...detail, scoreboard });
    },
  );

  reg(server, "tournament_overview",
    "Giải đấu. Không code → danh sách giải. Có code → chi tiết giải + players + matches; view=\"standings\" → bảng xếp hạng. (GET /api/tournaments, /:code, /:code/standings)",
    {
      code: z.string().optional().describe("Mã giải, vd OC_T_... — trống = list"),
      view: z.enum(["detail", "standings"]).default("detail")
        .describe("Chỉ có ý nghĩa khi có code"),
    },
    async ({ code, view }) => {
      if (!code) {
        const data = await apiFetch("/api/tournaments");
        return text(data);
      }
      const path =
        view === "standings"
          ? `/api/tournaments/${encodeURIComponent(code)}/standings`
          : `/api/tournaments/${encodeURIComponent(code)}`;
      const data = await apiFetch(path);
      return text(data);
    },
  );

  reg(server, "match_questions",
    "Câu hỏi của match. Không questionCode → danh sách; có → chi tiết 1 câu. Cần login; non-staff bị strip answer/explanation. (GET /api/questions/:matchCode[/:questionCode])",
    {
      matchCode: z.string(),
      questionCode: z.string().optional(),
    },
    async ({ matchCode, questionCode }) => {
      const base = `/api/questions/${encodeURIComponent(matchCode)}`;
      const data = await apiFetch(
        questionCode ? `${base}/${encodeURIComponent(questionCode)}` : base,
      );
      return text(data);
    },
  );

  reg(server, "match_answers",
    "Bài nộp (đáp án) thí sinh của match. Không questionCode → toàn bộ (staff thấy all, player chỉ bài mình); có → đáp án 1 câu (staff-only, 403 nếu không phải staff). (GET /api/answers/:matchCode[/:questionCode])",
    {
      matchCode: z.string(),
      questionCode: z.string().optional(),
    },
    async ({ matchCode, questionCode }) => {
      const base = `/api/answers/${encodeURIComponent(matchCode)}`;
      const data = await apiFetch(
        questionCode ? `${base}/${encodeURIComponent(questionCode)}` : base,
      );
      return text(data);
    },
  );

  reg(server, "bank_search",
    "Tìm ngân hàng câu hỏi. Cần login hoặc agent token. Non-qauthor bị ẩn answer. (GET /api/bank/search)",
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

  // ── Write (API vẫn enforce role, thiếu quyền → 401/403) ──

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
