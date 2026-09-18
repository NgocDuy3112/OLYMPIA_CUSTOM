import { useCallback, useState } from "react";
import { HelpCircle, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";

const logger = createLogger("QAuthorQuestionPage");

interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
  options?: string | null;
}

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
  mediaUrl: "",
  options: "",
};

const QAuthorQuestionPage = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<QuestionData | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editExplanation, setEditExplanation] = useState("");
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
        setQuestions(json.data as unknown as QuestionData[]);
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
  }, [editing, editAnswer, editContent, editExplanation, editMediaUrl, editOptions, fetchQuestions, matchCode]);

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

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white">
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
    </div>
  );
};

export default QAuthorQuestionPage;
