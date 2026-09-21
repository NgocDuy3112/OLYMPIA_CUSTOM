import { useCallback, useState } from "react";
import { ListOrdered, Pencil, Plus, Search, Trash2, Trophy, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("QualifierTab");

interface QualifierQuestion {
  id: string;
  questionCode: string;
  content: string;
  options: string[];
  correctOption: string;
  explanation: string | null;
  mediaUrl: string | null;
  position: number;
  status: string;
}

interface Standing {
  playerId: string;
  userCode: string;
  userName: string;
  totalPoints: number;
  correctCount: number;
  avgCorrectTimeSec: number;
  rank: number;
}

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const toQuestion = (row: Record<string, unknown>): QualifierQuestion => ({
  id: String(row.id ?? ""),
  questionCode: String(row.questionCode ?? row.question_code ?? ""),
  content: String(row.content ?? ""),
  options: Array.isArray(row.options) ? (row.options as string[]) : [],
  correctOption: String(row.correctOption ?? row.correct_option ?? ""),
  explanation: (row.explanation as string | null) ?? null,
  mediaUrl:
    (row.mediaUrl as string | null) ?? (row.media_url as string | null) ?? null,
  position: Number(row.position ?? 0),
  status: String(row.status ?? "open"),
});

const emptyForm = {
  questionCode: "",
  content: "",
  options: "",
  correctOption: "A",
  explanation: "",
  mediaUrl: "",
  position: "1",
};

export const QualifierTab = () => {
  const [tournamentCode, setTournamentCode] = useState("");
  const [questions, setQuestions] = useState<QualifierQuestion[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState<QualifierQuestion | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editOptions, setEditOptions] = useState("");
  const [editCorrect, setEditCorrect] = useState("A");
  const [editPosition, setEditPosition] = useState("1");

  const base = useCallback(
    () => `/qualifier/${encodeURIComponent(tournamentCode.trim())}`,
    [tournamentCode],
  );

  const fetchQuestions = useCallback(async () => {
    const code = tournamentCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}${base()}/questions`, {
        credentials: "include",
      });
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setQuestions((json.data as Record<string, unknown>[]).map(toQuestion));
      } else {
        setQuestions([]);
      }
    } catch (err) {
      logger.error("Error fetching qualifier:", err);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [base, tournamentCode]);

  const fetchStandings = useCallback(async () => {
    const code = tournamentCode.trim();
    if (!code) return;
    try {
      const res = await fetch(`${API_BASE_URL}${base()}/standings?limit=16`, {
        credentials: "include",
      });
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setStandings(json.data as Standing[]);
      } else {
        setStandings([]);
      }
    } catch (err) {
      logger.error("Error fetching standings:", err);
      setStandings([]);
    }
  }, [base, tournamentCode]);

  const parseOptions = (raw: string): string[] | null => {
    const t = raw.trim();
    if (!t) return null;
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {
      // fall through
    }
    return t.split("|").map((s) => s.trim()).filter(Boolean);
  };

  const createQuestion = useCallback(async () => {
    const code = tournamentCode.trim();
    const options = parseOptions(form.options);
    if (!code || !form.questionCode.trim() || !form.content.trim() || !options) {
      alert("Nhập mã giải, mã câu, nội dung, options (JSON hoặc A|B|C|D).");
      return;
    }
    if (options.length < 4 || options.length > 6) {
      alert("Options phải 4-6 phương án.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}${base()}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          questionCode: form.questionCode.trim(),
          content: form.content.trim(),
          options,
          correctOption: form.correctOption,
          explanation: form.explanation.trim() || undefined,
          mediaUrl: form.mediaUrl.trim() || undefined,
          position: Number(form.position) || 1,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setForm({ ...emptyForm, position: String(questions.length + 2) });
        await fetchQuestions();
      } else {
        alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error creating qualifier:", err);
      alert("Lỗi kết nối khi tạo câu hỏi");
    } finally {
      setSaving(false);
    }
  }, [base, fetchQuestions, form, questions.length, tournamentCode]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const options = parseOptions(editOptions);
    if (!options || options.length < 4 || options.length > 6) {
      alert("Options phải 4-6 phương án.");
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE_URL}${base()}/questions/${encodeURIComponent(editing.questionCode)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            content: editContent.trim() || undefined,
            options,
            correctOption: editCorrect,
            position: Number(editPosition) || undefined,
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
      logger.error("Error patching qualifier:", err);
      alert("Lỗi kết nối khi sửa câu hỏi");
    }
  }, [base, editContent, editCorrect, editOptions, editPosition, editing, fetchQuestions]);

  const deleteQuestion = useCallback(
    async (q: QualifierQuestion) => {
      if (!window.confirm(`Xoá ${q.questionCode}?`)) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}${base()}/questions/${encodeURIComponent(q.questionCode)}`,
          { method: "DELETE", credentials: "include" },
        );
        const json = await res.json();
        if (res.ok) {
          await fetchQuestions();
        } else {
          alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error deleting qualifier:", err);
        alert("Lỗi kết nối khi xoá câu hỏi");
      }
    },
    [base, fetchQuestions],
  );

  const closeQuestion = useCallback(
    async (q: QualifierQuestion) => {
      if (!window.confirm(`Chốt + chấm ${q.questionCode}? Không sửa được sau khi chốt.`)) return;
      setClosing(q.questionCode);
      setCloseResult(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}${base()}/questions/${encodeURIComponent(q.questionCode)}/close`,
          { method: "POST", credentials: "include" },
        );
        const json: ApiResponse = await res.json();
        if (res.ok) {
          setCloseResult((json.data as Record<string, unknown>) ?? null);
          await fetchQuestions();
          await fetchStandings();
        } else {
          alert(`Chốt thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error closing qualifier:", err);
        alert("Lỗi kết nối khi chốt câu hỏi");
      } finally {
        setClosing(null);
      }
    },
    [base, fetchQuestions, fetchStandings],
  );

  return (
    <div className="flex flex-col gap-4">
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-blue-950 border border-blue-600 rounded-xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-blue-200">Sửa câu vòng loại</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded hover:bg-blue-800">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-blue-400 font-mono -mt-2">{editing.questionCode}</p>
            <label className="text-xs text-blue-300">Nội dung</label>
            <textarea
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm resize-none"
            />
            <label className="text-xs text-blue-300">Options (JSON hoặc A|B|C|D)</label>
            <input
              value={editOptions}
              onChange={(e) => setEditOptions(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm font-mono"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-blue-300">Đáp án đúng</label>
                <select
                  value={editCorrect}
                  onChange={(e) => setEditCorrect(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
                >
                  {LETTERS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-blue-300">Vị trí 1-16</label>
                <input
                  value={editPosition}
                  onChange={(e) => setEditPosition(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm">
                Huỷ
              </button>
              <button onClick={() => void saveEdit()} className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 font-semibold text-sm">
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-green-300 uppercase tracking-wide">
          <ListOrdered size={16} /> Vòng loại — 16 câu / giải
        </h3>
        <div className="flex gap-2">
          <input
            value={tournamentCode}
            onChange={(e) => setTournamentCode(e.target.value)}
            placeholder="Mã giải đấu (VD: OC3_T_...)"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
          <button
            onClick={() => { void fetchQuestions(); void fetchStandings(); }}
            disabled={loading || !tournamentCode.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
          >
            <Search size={14} /> Tải
          </button>
          <button
            onClick={() => {
              const code = tournamentCode.trim();
              if (!code) return;
              setSeeding(true);
              fetch(`${API_BASE_URL}${base()}/seed`, { method: "POST", credentials: "include" })
                .then((r) => r.json().catch(() => null))
                .then((json) => {
                  if (!json || json.status !== "success") alert(`Seed thất bại: ${json?.message ?? "Lỗi không xác định"}`);
                  return Promise.all([fetchQuestions(), fetchStandings()]);
                })
                .catch((err) => {
                  logger.error("Error seeding qualifier:", err);
                  alert("Lỗi kết nối khi seed");
                })
                .finally(() => setSeeding(false));
            }}
            disabled={seeding || !tournamentCode.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm text-white"
          >
            <Plus size={14} /> {seeding ? "Đang seed…" : "Seed 16 câu"}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            value={form.questionCode}
            onChange={(e) => setForm((p) => ({ ...p, questionCode: e.target.value }))}
            placeholder="Mã câu (VD: VL_01)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.correctOption}
              onChange={(e) => setForm((p) => ({ ...p, correctOption: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            >
              {LETTERS.map((l) => (
                <option key={l} value={l}>Đáp án {l}</option>
              ))}
            </select>
            <input
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
              placeholder="Vị trí 1-16"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
            />
          </div>
          <textarea
            rows={2}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Nội dung câu hỏi"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none md:col-span-2"
          />
          <input
            value={form.options}
            onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
            placeholder='Options JSON ["A","B","C","D"] hoặc A|B|C|D (4-6)'
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm md:col-span-2"
          />
          <input
            value={form.explanation}
            onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
            placeholder="Giải thích (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          />
          <input
            value={form.mediaUrl}
            onChange={(e) => setForm((p) => ({ ...p, mediaUrl: e.target.value }))}
            placeholder="Media URL (tuỳ chọn)"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
          />
        </div>
        <button
          onClick={() => void createQuestion()}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
        >
          <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu vòng loại"}
        </button>
      </div>

      {closeResult && (
        <div className="bg-emerald-900/40 border border-emerald-600 rounded-xl p-4 text-sm">
          <p className="font-bold text-emerald-300">Đã chốt + chấm</p>
          <p className="text-emerald-200 font-mono text-xs mt-1">
            X đúng={String(closeResult.correctCount)} · Y sai={String(closeResult.wrongCount)} · Z bỏ={String(closeResult.noAnswerCount)} · đúng +{String(closeResult.perCorrect)} · sai {String(closeResult.perWrong)}
          </p>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-green-300 uppercase tracking-wide">
          Đề vòng loại ({questions.length}/16)
        </h3>
        {loading ? (
          <p className="text-gray-400 text-sm">Đang tải…</p>
        ) : questions.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có câu hỏi. Nhập mã giải rồi bấm Tải.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-green-300 border-b border-white/10">
                <th className="py-2 px-2">#</th>
                <th className="py-2 px-2">Mã</th>
                <th className="py-2 px-2">Nội dung</th>
                <th className="py-2 px-2">Đáp án</th>
                <th className="py-2 px-2">Trạng thái</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.id} className="border-b border-white/5 align-top">
                  <td className="py-2 px-2 font-mono text-xs">{q.position}</td>
                  <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">{q.questionCode}</td>
                  <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                  <td className="py-2 px-2 font-semibold">{q.correctOption || "(ẩn)"}</td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    {q.status === "closed" ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-600/20 text-emerald-300">Đã chốt</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-600/20 text-yellow-300">Mở</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {q.status === "open" && (
                        <>
                          <button
                            onClick={() => {
                              setEditing(q);
                              setEditContent(q.content);
                              setEditOptions(JSON.stringify(q.options));
                              setEditCorrect(q.correctOption || "A");
                              setEditPosition(String(q.position));
                            }}
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20"
                            title="Sửa"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => void closeQuestion(q)}
                            disabled={closing === q.questionCode}
                            className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-xs text-white"
                          >
                            {closing === q.questionCode ? "Đang chốt…" : "Chốt + chấm"}
                          </button>
                          <button
                            onClick={() => void deleteQuestion(q)}
                            className="p-1.5 rounded bg-red-700/70 hover:bg-red-600"
                            title="Xoá"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-green-300 uppercase tracking-wide">
            <Trophy size={16} /> Top 16
          </h3>
          <button
            onClick={() => void fetchStandings()}
            disabled={!tournamentCode.trim()}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
          >
            Làm mới
          </button>
        </div>
        {standings.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bảng xếp hạng (chỉ tính câu đã chốt).</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-green-300 border-b border-white/10">
                <th className="py-2 px-2">Hạng</th>
                <th className="py-2 px-2">Thí sinh</th>
                <th className="py-2 px-2">Tổng điểm</th>
                <th className="py-2 px-2">Câu đúng</th>
                <th className="py-2 px-2">Avg time đúng (s)</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.playerId} className="border-b border-white/5">
                  <td className="py-2 px-2 font-mono">{s.rank}</td>
                  <td className="py-2 px-2">{s.userName} <span className="text-gray-500 font-mono text-xs">· {s.userCode}</span></td>
                  <td className="py-2 px-2 font-bold">{s.totalPoints}</td>
                  <td className="py-2 px-2">{s.correctCount}</td>
                  <td className="py-2 px-2 font-mono">{Number.isFinite(s.avgCorrectTimeSec) ? s.avgCorrectTimeSec.toFixed(3) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
