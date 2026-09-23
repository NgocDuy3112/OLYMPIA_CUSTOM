import { useCallback, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { RowActions } from "@/components/shared/RowActions";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { normalizeQuestionRow } from "@/utils/questionMapper";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { EditQuestionPanel, type QuestionEditValue } from "./EditQuestionPanel";
import { BANK_PAGE_SIZE, toBankData, type BankData } from "./bankTypes";

const logger = createLogger("MatchTab");

interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  hintText?: string | null;
  media_url: string | null;
  options?: string | null;
}

const toQuestionData = (row: Record<string, unknown>): QuestionData => {
  const n = normalizeQuestionRow(row);
  return {
    question_code: n.questionCode,
    content: n.content,
    answer: n.answer,
    explanation: n.explanation,
    hintText: n.hintText,
    media_url: n.mediaUrl,
    options: n.options,
  };
};

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

const emptyForm = {
  questionCode: "",
  content: "",
  answer: "",
  explanation: "",
  hintText: "",
  mediaUrl: "",
  options: "",
};

export const MatchTab = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankData[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankRound, setBankRound] = useState("KD_C");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<QuestionData | null>(null);

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

  const saveEdit = useCallback(async (value: QuestionEditValue) => {
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
            content: value.content.trim() || null,
            answer: value.answer.trim() || null,
            explanation: value.explanation.trim() || null,
            hint_text: value.hintText.trim() || null,
            media_url: value.mediaUrl.trim() || null,
            options: value.options.trim() || null,
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
  }, [editing, fetchQuestions, matchCode]);

  const deleteQuestion = useCallback(async (q: QuestionData) => {
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
  }, [fetchQuestions, matchCode]);

  const fetchBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankQuery.trim()) params.set("q", bankQuery.trim());
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", "1");
      const res = await fetch(
        `${API_BASE_URL}/bank/search?${params.toString()}`,
        { credentials: "include" },
      );
      const json = await res.json();
      const data = json.data as { rows: Record<string, unknown>[] } | null;
      if (json.status === "success" && data) {
        setBankQuestions((data.rows as Record<string, unknown>[]).map(toBankData));
      } else {
        setBankQuestions([]);
      }
    } catch (err) {
      logger.error("Error fetching bank:", err);
      setBankQuestions([]);
    } finally {
      setBankLoading(false);
    }
  }, [bankQuery]);

  const reuseFromBank = useCallback(async (q: BankData) => {
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
        body: JSON.stringify({ matchCode: code, bankCode: q.bank_code, round }),
      });
      const json = await res.json();
      if (res.ok) {
        setAddedCodes((prev) => new Set(prev).add(q.bank_code));
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
  }, [fetchQuestions, matchCode, bankRound]);

  return (
    <div className="flex flex-col gap-4">
      <EditQuestionPanel item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />

      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4">
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
            placeholder="Mã câu hỏi (VD: OC3_Q_KD_C_1)"
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

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-green-300 uppercase tracking-wide">
          Pick từ bank vào trận
        </h3>
        <div className="flex gap-2">
          <input
            value={bankQuery}
            onChange={(e) => setBankQuery(e.target.value)}
            placeholder="Tìm bank theo mã / nội dung…"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <input
            value={bankRound}
            onChange={(e) => setBankRound(e.target.value.toUpperCase())}
            placeholder="Round"
            className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
          <button
            onClick={() => void fetchBank()}
            disabled={bankLoading}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
          >
            <Search size={14} /> Tìm
          </button>
        </div>
        {bankQuestions.map((q) => {
          const added = addedCodes.has(q.bank_code);
          const adding = addingId === q.bank_code;
          return (
            <div key={q.bank_id} className="flex items-center gap-2 text-sm">
              <p className="flex-1 truncate">
                <span className="font-mono text-xs text-green-300">{q.bank_code}</span>{" "}
                <span className="text-white">{q.content}</span>
              </p>
              <button
                onClick={() => void reuseFromBank(q)}
                disabled={adding || added}
                className="px-2 py-1 rounded text-xs text-white bg-green-700 hover:bg-green-600 disabled:opacity-50"
              >
                {adding ? "Đang thêm…" : added ? "Đã thêm" : "Thêm vào trận"}
              </button>
            </div>
          );
        })}
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
                    <RowActions onEdit={() => setEditing(q)} onDelete={() => void deleteQuestion(q)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
