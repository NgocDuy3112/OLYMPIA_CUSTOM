import { useCallback, useState } from "react";
import { HelpCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { normalizeQuestionRow } from "@/utils/questionMapper";
import { RenderMedia } from "@/components/shared/RenderMedia";

const logger = createLogger("QAuthorQuestionPage");

interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  hint_text?: string | null;
  hintText?: string | null;
  media_url: string | null;
  options?: string | null;
  is_used?: boolean | null;
  isUsed?: boolean | null;
}

const toQuestionData = (row: Record<string, unknown>): QuestionData => {
  const n = normalizeQuestionRow(row);
  return {
    question_code: n.questionCode,
    content: n.content,
    answer: n.answer,
    explanation: n.explanation,
    hint_text: n.hintText,
    hintText: n.hintText,
    media_url: n.mediaUrl,
    options: n.options,
    is_used: n.isUsed,
    isUsed: n.isUsed,
  };
};

const isQuestionUsed = (q: QuestionData): boolean =>
  Boolean(q.is_used ?? q.isUsed ?? false);

interface BankUsage {
  matchCode: string;
  questionCode: string;
  isUsed: boolean;
}

interface BankData {
  bank_id: string;
  bank_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
  options?: string | null;
  tags?: string | null;
  round_hint?: string | null;
  usedCount: number;
  usedIn: BankUsage[];
}

const toBankData = (row: Record<string, unknown>): BankData => {
  const rawUsed = Array.isArray(row.usedIn ?? row.used_in)
    ? (row.usedIn ?? row.used_in) as Record<string, unknown>[]
    : [];
  return {
    bank_id: String(row.id ?? row.bank_id ?? ""),
    bank_code: String(row.bankCode ?? row.bank_code ?? ""),
    content: String(row.content ?? ""),
    answer: String(row.answer ?? ""),
    explanation: (row.explanation as string | null) ?? null,
    media_url:
      (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
    options: (row.options as string | null) ?? null,
    tags: (row.tags as string | null) ?? null,
    round_hint: (row.roundHint as string | null) ?? (row.round_hint as string | null) ?? null,
    usedCount: Number(row.usedCount ?? row.used_count ?? rawUsed.length ?? 0),
    usedIn: rawUsed.map((u) => ({
      matchCode: String(u.matchCode ?? u.match_code ?? ""),
      questionCode: String(u.questionCode ?? u.question_code ?? ""),
      isUsed: Boolean(u.isUsed ?? u.is_used ?? false),
    })),
  };
};

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

interface BankSearchResponse {
  status: "success" | "error";
  message: string;
  data: {
    rows: Record<string, unknown>[];
    total: number;
    limit: number;
    page: number;
    pages: number;
  } | null;
}

const BANK_PAGE_SIZE = 20;

const emptyForm = {
  questionCode: "",
  content: "",
  answer: "",
  explanation: "",
  hintText: "",
  mediaUrl: "",
  options: "",
};

const QAuthorQuestionPage = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"match" | "bank">("match");
  const [bankQuestions, setBankQuestions] = useState<BankData[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankRound, setBankRound] = useState("KD_C");
  const [bankUsed, setBankUsed] = useState<"all" | "only" | "unused">("all");
  const [bankPage, setBankPage] = useState(1);
  const [bankTotal, setBankTotal] = useState(0);
  const [bankPages, setBankPages] = useState(1);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<QuestionData | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
  const [editHintText, setEditHintText] = useState("");
  const [editMediaUrl, setEditMediaUrl] = useState("");
  const [editOptions, setEditOptions] = useState("");

  const fetchQuestions = useCallback(async () => {
    const code = matchCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/questions?match_code=${encodeURIComponent(code)}`,
        { credentials: "include" },
      );
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setQuestions(
          (json.data as Record<string, unknown>[]).map(toQuestionData),
        );
      } else {
        setQuestions([]);
        logger.warn("Fetch questions failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching questions:", err);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [matchCode]);

  const createQuestion = useCallback(async () => {
    const code = matchCode.trim();
    if (!code || !form.questionCode.trim() || !form.content.trim() || !form.answer.trim()) {
      alert("Nhập mã trận, mã câu hỏi, nội dung và đáp án.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          matchCode: code,
          questionCode: form.questionCode.trim(),
          content: form.content.trim(),
          answer: form.answer.trim(),
          explanation: form.explanation.trim() || undefined,
          hintText: form.hintText.trim() || undefined,
          mediaUrl: form.mediaUrl.trim() || undefined,
          options: form.options.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setForm(emptyForm);
        await fetchQuestions();
      } else {
        alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error creating question:", err);
      alert("Lỗi kết nối khi tạo câu hỏi");
    } finally {
      setSaving(false);
    }
  }, [fetchQuestions, form, matchCode]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const code = matchCode.trim();
    try {
      const res = await fetch(
        `${API_BASE_URL}/questions/${encodeURIComponent(code)}/${encodeURIComponent(editing.question_code)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content: editContent.trim() || null,
            answer: editAnswer.trim() || null,
            explanation: editExplanation.trim() || null,
            hint_text: editHintText.trim() || null,
            media_url: editMediaUrl.trim() || null,
            options: editOptions.trim() || null,
          }),
        },
      );
      const json = await res.json();
      if (res.ok) {
        setEditing(null);
        await fetchQuestions();
      } else {
        alert(`Lưu thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error patching question:", err);
      alert("Lỗi kết nối khi sửa câu hỏi");
    }
  }, [editing, editAnswer, editContent, editExplanation, editHintText, editMediaUrl, editOptions, fetchQuestions, matchCode]);

  const deleteQuestion = useCallback(
    async (q: QuestionData) => {
      const code = matchCode.trim();
      if (!window.confirm(`Xoá câu hỏi ${q.question_code}?`)) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/questions/${encodeURIComponent(code)}/${encodeURIComponent(q.question_code)}`,
          { method: "DELETE", credentials: "include" },
        );
        const json = await res.json();
        if (res.ok) {
          await fetchQuestions();
        } else {
          alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error deleting question:", err);
        alert("Lỗi kết nối khi xoá câu hỏi");
      }
    },
    [fetchQuestions, matchCode],
  );

  // Bank: search stable QB_* bank, pick copies into match with OC<number>_Q_* code.
  const fetchBank = useCallback(async (page = 1) => {
    setBankLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankQuery.trim()) params.set("q", bankQuery.trim());
      if (bankUsed !== "all") params.set("used", bankUsed);
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", String(page));
      const res = await fetch(
        `${API_BASE_URL}/bank/search?${params.toString()}`,
        { credentials: "include" },
      );
      const json: BankSearchResponse = await res.json();
      if (json.status === "success" && json.data) {
        // Backward compat: old API returned a bare array.
        const payload = json.data as unknown;
        if (Array.isArray(payload)) {
          setBankQuestions(
            (payload as Record<string, unknown>[]).map(toBankData),
          );
          setBankTotal(payload.length);
          setBankPages(1);
          setBankPage(1);
        } else {
          setBankQuestions(
            (json.data.rows as Record<string, unknown>[]).map(toBankData),
          );
          setBankTotal(json.data.total);
          setBankPages(json.data.pages);
          setBankPage(json.data.page);
        }
      } else {
        setBankQuestions([]);
        setBankTotal(0);
        setBankPages(1);
      }
    } catch (err) {
      logger.error("Error fetching bank:", err);
      setBankQuestions([]);
    } finally {
      setBankLoading(false);
    }
  }, [bankQuery, bankUsed]);

  const reuseFromBank = useCallback(
    async (q: BankData) => {
      const code = matchCode.trim();
      if (!code) {
        alert("Nhập mã trận đấu hiện tại trước khi thêm vào trận.");
        return;
      }
      const round = bankRound.trim().toUpperCase() || "KD_C";
      setAddingId(q.bank_code);
      try {
        const res = await fetch(`${API_BASE_URL}/questions/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            matchCode: code,
            bankCode: q.bank_code,
            round,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          const newCode = String(
            (json.data as Record<string, unknown> | null)?.questionCode ?? q.bank_code,
          );
          setAddedCodes((prev) => new Set(prev).add(q.bank_code));
          alert(`Đã thêm ${newCode} vào trận.`);
          await fetchQuestions();
        } else {
          alert(`Thêm thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error adding to match:", err);
        alert("Lỗi kết nối khi thêm vào trận");
      } finally {
        setAddingId(null);
      }
    },
    [fetchQuestions, matchCode, bankRound],
  );

  const filteredBank = bankQuestions;

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white">
      <div className="flex gap-2">
        <button
          onClick={() => setTab("match")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "match" ? "bg-green-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}
        >
          Câu hỏi trận này
        </button>
        <button
          onClick={() => setTab("bank")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === "bank" ? "bg-green-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}
        >
          Bank câu hỏi
        </button>
      </div>
      {tab === "bank" && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-green-300">Bank — tìm + thêm vào trận</h2>
            <p className="text-xs text-gray-500">
              Trận đích: <span className="font-mono text-green-300">{matchCode.trim() || "(chưa nhập)"}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <input
              value={matchCode}
              onChange={(e) => setMatchCode(e.target.value)}
              placeholder="Mã trận đích (VD: OC3_M_... / OC4_M_...)"
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
            />
            <input
              value={bankRound}
              onChange={(e) => setBankRound(e.target.value.toUpperCase())}
              placeholder="Round (KD_C, GM, BP, VD)"
              className="w-44 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={bankQuery}
              onChange={(e) => setBankQuery(e.target.value)}
              placeholder="Tìm theo mã / nội dung / đáp án…"
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            />
            <select
              value={bankUsed}
              onChange={(e) => setBankUsed(e.target.value as "all" | "only" | "unused")}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            >
              <option value="all">Tất cả</option>
              <option value="unused">Chưa dùng</option>
              <option value="only">Đã dùng</option>
            </select>
            <button
              onClick={() => void fetchBank(1)}
              disabled={bankLoading}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
            >
              <Search size={14} /> Tìm
            </button>
          </div>
          {bankLoading ? (
            <p className="text-gray-400 text-sm">Đang tải…</p>
          ) : filteredBank.length === 0 ? (
            <p className="text-gray-400 text-sm">Chưa có dữ liệu bank.</p>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-300 border-b border-white/10">
                  <th className="py-2 px-2">Mã</th>
                  <th className="py-2 px-2">Nội dung</th>
                  <th className="py-2 px-2">Đáp án</th>
                  <th className="py-2 px-2">Trạng thái</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredBank.map((q) => {
                  const added = addedCodes.has(q.bank_code);
                  const adding = addingId === q.bank_code;
                  return (
                  <tr key={q.bank_code} className="border-b border-white/5 align-top">
                    <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                      {q.bank_code}
                      {q.round_hint && (
                        <span className="ml-1 text-gray-500">· {q.round_hint}</span>
                      )}
                      {q.tags && (
                        <span className="ml-1 text-gray-500">· {q.tags}</span>
                      )}
                    </td>
                    <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                    <td className="py-2 px-2 font-semibold">{q.answer}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {added ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-600/20 text-green-300">
                          Đã thêm vào {matchCode.trim() || "trận này"}
                        </span>
                      ) : q.usedCount > 0 ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs bg-yellow-600/20 text-yellow-300"
                          title={q.usedIn.map((u) => `${u.matchCode}:${u.questionCode}${u.isUsed ? " (live)" : ""}`).join(", ")}
                        >
                          Đã dùng ×{q.usedCount}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-white/10 text-gray-400">
                          Chưa dùng
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => void reuseFromBank(q)}
                        disabled={adding || added}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs text-white ${added ? "bg-white/10 text-gray-500" : "bg-green-700 hover:bg-green-600 disabled:opacity-50"}`}
                        title={added ? "Đã thêm vào trận" : `Pick vào trận với round ${bankRound.trim() || "KD_C"}`}
                      >
                        <Plus size={13} /> {adding ? "Đang thêm…" : added ? "Đã thêm" : "Thêm vào trận"}
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">
                Trang {bankPage}/{bankPages} · {bankTotal} câu
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void fetchBank(bankPage - 1)}
                  disabled={bankLoading || bankPage <= 1}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
                >
                  ← Trước
                </button>
                <button
                  onClick={() => void fetchBank(bankPage + 1)}
                  disabled={bankLoading || bankPage >= bankPages}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
                >
                  Sau →
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      )}
      {tab === "match" && (
      <>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-blue-950 border border-blue-600 rounded-xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-blue-200">Sửa câu hỏi</h3>
              <button
                onClick={() => setEditing(null)}
                className="p-1 rounded hover:bg-blue-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-blue-400 font-mono -mt-2">{editing.question_code}</p>
            <label className="text-xs text-blue-300">Nội dung</label>
            <textarea
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm resize-none"
            />
            <label className="text-xs text-blue-300">Đáp án</label>
            <input
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
            />
            <label className="text-xs text-blue-300">Giải thích</label>
            <input
              value={editExplanation}
              onChange={(e) => setEditExplanation(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
            />
            <label className="text-xs text-blue-300">Gợi ý GIAI_MA</label>
            <input
              value={editHintText}
              onChange={(e) => setEditHintText(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
            />
            <label className="text-xs text-blue-300">Media URL</label>
            <input
              value={editMediaUrl}
              onChange={(e) => setEditMediaUrl(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm font-mono"
            />
            <label className="text-xs text-blue-300">Options (JSON hoặc A|B|C)</label>
            <input
              value={editOptions}
              onChange={(e) => setEditOptions(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm font-mono"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm"
              >
                Huỷ
              </button>
              <button
                onClick={() => void saveEdit()}
                className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 font-semibold text-sm"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
          <HelpCircle size={20} /> Soạn câu hỏi
        </h2>
        <div className="flex gap-2">
          <input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            placeholder="Mã trận đấu"
            className="flex-1 px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white font-mono text-sm"
          />
          <button
            onClick={() => void fetchQuestions()}
            disabled={loading || !matchCode.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm"
          >
            <Search size={14} /> Tải
          </button>
          <button
            onClick={() => void fetchQuestions()}
            disabled={loading}
            className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={form.questionCode}
            onChange={(e) => setForm((p) => ({ ...p, questionCode: e.target.value }))}
            placeholder="Mã câu hỏi (VD: OC3_Q_KD_C_1 / OC4_Q_KD_C_1)"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white font-mono text-sm"
          />
          <input
            value={form.answer}
            onChange={(e) => setForm((p) => ({ ...p, answer: e.target.value }))}
            placeholder="Đáp án"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm"
          />
          <textarea
            rows={2}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Nội dung câu hỏi"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm resize-none md:col-span-2"
          />
          <input
            value={form.explanation}
            onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
            placeholder="Giải thích (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm"
          />
          <input
            value={form.hintText}
            onChange={(e) => setForm((p) => ({ ...p, hintText: e.target.value }))}
            placeholder="Gợi ý GIAI_MA (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm"
          />
          <input
            value={form.mediaUrl}
            onChange={(e) => setForm((p) => ({ ...p, mediaUrl: e.target.value }))}
            placeholder="Media URL (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white font-mono text-sm"
          />
          <input
            value={form.options}
            onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
            placeholder="Options JSON (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white font-mono text-sm md:col-span-2"
          />
        </div>
        {form.mediaUrl.trim() && (
          <div className="rounded-lg bg-blue-950 border border-blue-700 p-3">
            <p className="text-xs text-blue-300 mb-2">Preview media:</p>
            <div className="max-h-64 overflow-hidden rounded">
              <RenderMedia mediaUrl={form.mediaUrl.trim()} />
            </div>
          </div>
        )}
        <button
          onClick={() => void createQuestion()}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
        >
          <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu hỏi"}
        </button>
      </div>

      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
          Danh sách ({questions.length})
        </h3>
        {loading ? (
          <p className="text-gray-400 text-sm">Đang tải…</p>
        ) : questions.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có câu hỏi. Nhập mã trận rồi bấm Tải.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-blue-900">
              <tr className="text-left text-blue-300 border-b border-blue-700">
                <th className="py-2 px-2">Mã</th>
                <th className="py-2 px-2">Nội dung</th>
                <th className="py-2 px-2">Đáp án</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.question_code} className="border-b border-blue-800/50 align-top">
                  <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">{q.question_code}</td>
                  <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                  <td className="py-2 px-2 font-semibold">{q.answer}</td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => {
                          setEditing(q);
                          setEditContent(q.content);
                          setEditAnswer(q.answer);
                          setEditExplanation(q.explanation ?? "");
                          setEditHintText(q.hint_text ?? q.hintText ?? "");
                          setEditMediaUrl(q.media_url ?? "");
                          setEditOptions(typeof q.options === "string" ? q.options : "");
                        }}
                        className="p-1.5 rounded bg-white-600/70 hover:bg-white-500"
                        title="Sửa"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => void deleteQuestion(q)}
                        className="p-1.5 rounded bg-red-700/70 hover:bg-red-600"
                        title="Xoá"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
};

export default QAuthorQuestionPage;
