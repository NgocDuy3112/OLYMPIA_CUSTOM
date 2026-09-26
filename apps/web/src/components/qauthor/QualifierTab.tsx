import { useCallback, useState } from "react";
import { Plus, Search, Trophy } from "lucide-react";
import { RowActions } from "@/components/shared/RowActions";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { EditQualifierPanel, type QualifierEditValue } from "./EditQualifierPanel";
import { QualifierOptionsInput } from "./QualifierOptionsInput";

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
  optionList: ["", "", "", ""],
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
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QualifierQuestion | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<QualifierQuestion | null>(null);
  const [closeResult, setCloseResult] = useState<Record<string, unknown> | null>(null);
  const [editing, setEditing] = useState<QualifierQuestion | null>(null);

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

  const freePositions = [...Array(16)].map((_, i) => i + 1).filter(
    (p) => !questions.some((q) => q.position === p),
  );

  const handlePositionChange = (pos: string) => {
    setForm((p) => {
      const n = Number(pos) || 1;
      const auto = `VL_${String(n).padStart(2, "0")}`;
      const code = !p.questionCode.trim() || /^VL_\d{2}$/.test(p.questionCode.trim()) ? auto : p.questionCode;
      return { ...p, position: pos, questionCode: code };
    });
  };

  const createQuestion = useCallback(async () => {
    const code = tournamentCode.trim();
    const options = form.optionList.map((s) => s.trim());
    if (!code || !form.questionCode.trim() || !form.content.trim() || options.some((s) => !s)) {
      alert("Nhập mã giải, mã câu, nội dung và đủ phương án.");
      return;
    }
    if (!LETTERS.slice(0, options.length).includes(form.correctOption)) {
      alert("Đáp án đúng phải nằm trong số phương án đã nhập.");
      return;
    }
    const pos = Number(form.position);
    if (!Number.isInteger(pos) || pos < 1 || pos > 16) {
      alert("Vị trí phải từ 1 đến 16.");
      return;
    }
    if (questions.some((q) => q.position === pos)) {
      alert(`Vị trí ${pos} đã có câu hỏi.`);
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
          position: pos,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        const next = [...Array(16)].map((_, i) => i + 1).find(
          (p) => p !== pos && !questions.some((q) => q.position === p),
        ) ?? 1;
        setForm({ ...emptyForm, position: String(next), questionCode: `VL_${String(next).padStart(2, "0")}` });
        setShowForm(false);
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
  }, [base, fetchQuestions, form, questions, tournamentCode]);

  const saveEdit = useCallback(async (value: QualifierEditValue) => {
    if (!editing) return;
    const options = parseOptions(value.options);
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
            content: value.content.trim() || undefined,
            options,
            correctOption: value.correctOption,
            position: Number(value.position) || undefined,
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
  }, [base, editing, fetchQuestions]);

  const confirmDeleteQuestion = useCallback(
    async () => {
      if (!deleting) return;
      setDeleteSaving(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}${base()}/questions/${encodeURIComponent(deleting.questionCode)}`,
          { method: "DELETE", credentials: "include" },
        );
        const json = await res.json();
        if (res.ok) {
          setDeleting(null);
          await fetchQuestions();
        } else {
          alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error deleting qualifier:", err);
        alert("Lỗi kết nối khi xoá câu hỏi");
      } finally {
        setDeleteSaving(false);
      }
    },
    [base, deleting, fetchQuestions],
  );

  const confirmCloseQuestion = useCallback(
    async () => {
      if (!pendingClose) return;
      setClosing(pendingClose.questionCode);
      setCloseResult(null);
      try {
        const res = await fetch(
          `${API_BASE_URL}${base()}/questions/${encodeURIComponent(pendingClose.questionCode)}/close`,
          { method: "POST", credentials: "include" },
        );
        const json: ApiResponse = await res.json();
        if (res.ok) {
          setCloseResult((json.data as Record<string, unknown>) ?? null);
          setPendingClose(null);
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
    [base, fetchQuestions, fetchStandings, pendingClose],
  );

  return (
    <div className="flex flex-col gap-4">
      <EditQualifierPanel item={editing} onClose={() => setEditing(null)} onSave={saveEdit} />
      <ConfirmActionPanel
        open={pendingClose !== null}
        title="Chốt + chấm?"
        tone="danger"
        itemCode={pendingClose?.questionCode}
        message="Sau khi chốt sẽ công khai đáp án, tính điểm và không sửa được."
        confirmLabel="Chốt + chấm"
        saving={closing === pendingClose?.questionCode}
        onClose={() => setPendingClose(null)}
        onConfirm={confirmCloseQuestion}
      />
      <ConfirmActionPanel
        open={deleting !== null}
        title="Xoá câu vòng loại?"
        tone="danger"
        itemCode={deleting?.questionCode}
        message={deleting ? `Xoá câu “${deleting.content}” khỏi ${tournamentCode.trim()}?` : ""}
        confirmLabel="Xoá"
        saving={deleteSaving}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDeleteQuestion}
      />

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
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
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white font-medium transition-colors"
          >
            <Search size={14} /> Tải
          </button>
          <button
            onClick={() => setShowForm(true)}
            disabled={!tournamentCode.trim()}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
          >
            <Plus size={14} /> Soạn câu
          </button>
        </div>
        {tournamentCode.trim() && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${Math.min(questions.length / 16 * 100, 100)}%` }}
              />
            </div>
            <span className="font-mono text-xs text-gray-400 whitespace-nowrap">
              {questions.length}/16 câu · {questions.filter((q) => q.status === "closed").length} đã chốt
            </span>
          </div>
        )}
      </div>

      <SidePanel
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Soạn câu mới"
        wide
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setForm({ ...emptyForm, position: String(freePositions[0] ?? 1), questionCode: `VL_${String(freePositions[0] ?? 1).padStart(2, "0")}` })}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
            >
              Làm lại
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
            >
              Huỷ
            </button>
            <button
              onClick={() => void createQuestion()}
              disabled={saving || !tournamentCode.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
            >
              <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu vòng loại"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">Vị trí và nội dung</p>
          <span className="font-mono text-xs text-gray-400">
            {questions.length}/16 câu · còn trống {freePositions.length}
          </span>
        </div>

        {/* Bước 1 — vị trí + mã câu + nội dung */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400">1 · Vị trí và nội dung</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500">Vị trí</span>
              <select
                value={form.position}
                onChange={(e) => handlePositionChange(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
              >
                {[...Array(16)].map((_, i) => {
                  const p = i + 1;
                  const taken = questions.some((q) => q.position === p);
                  return (
                    <option key={p} value={String(p)} disabled={taken}>
                      #{p}{taken ? " (đã có)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 col-span-1 sm:col-span-3">
              <span className="text-[11px] text-gray-500">Mã câu</span>
              <input
                value={form.questionCode}
                onChange={(e) => setForm((p) => ({ ...p, questionCode: e.target.value.toUpperCase() }))}
                placeholder="VL_01"
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
              />
            </label>
          </div>
          <textarea
            rows={3}
            value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            placeholder="Nội dung câu hỏi *"
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none"
          />
        </div>

        {/* Bước 2 — phương án (bấm chữ cái để chọn đáp án đúng) */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400">2 · Phương án — bấm chữ cái để chọn đáp án đúng</p>
          <QualifierOptionsInput
            options={form.optionList}
            correct={form.correctOption}
            onChange={(optionList) => setForm((p) => ({ ...p, optionList }))}
            onCorrectChange={(correctOption) => setForm((p) => ({ ...p, correctOption }))}
          />
        </div>

        {/* Bước 3 — bổ sung */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400">3 · Bổ sung (tuỳ chọn)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              value={form.explanation}
              onChange={(e) => setForm((p) => ({ ...p, explanation: e.target.value }))}
              placeholder="Giải thích"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            />
            <input
              value={form.mediaUrl}
              onChange={(e) => setForm((p) => ({ ...p, mediaUrl: e.target.value }))}
              placeholder="Media URL"
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
            />
          </div>
        </div>
        </div>
      </SidePanel>

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
          <>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 16 }, (_, i) => {
                const pos = i + 1;
                const q = questions.find((x) => x.position === pos);
                return (
                  <span
                    key={pos}
                    title={q ? `${q.questionCode} · ${q.status === "closed" ? "Đã chốt" : "Mở"}` : `Trống vị trí ${pos}`}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg font-mono text-xs border ${
                      !q
                        ? "bg-white/5 border-white/10 text-gray-600"
                        : q.status === "closed"
                          ? "bg-emerald-600/20 border-emerald-600 text-emerald-200"
                          : "bg-yellow-600/20 border-yellow-600 text-yellow-200"
                    }`}
                  >
                    {pos}
                  </span>
                );
              })}
            </div>
            {[...questions].sort((a, b) => a.position - b.position).map((q) => (
              <div key={q.id} className="flex flex-col gap-1.5 py-2 border-b border-white/5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-gray-400 w-6">#{q.position}</span>
                  <span className="font-mono text-xs text-green-300">{q.questionCode}</span>
                  <p className="flex-1 truncate text-white">{q.content}</p>
                  {q.status === "closed" ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-600/20 text-emerald-300 whitespace-nowrap">Đã chốt</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-600/20 text-yellow-300 whitespace-nowrap">Mở</span>
                  )}
                  <RowActions
                    onEdit={q.status === "open" ? () => setEditing(q) : undefined}
                    onDelete={q.status === "open" ? () => setDeleting(q) : undefined}
                  >
                    {q.status === "open" && (
                      <button
                        onClick={() => setPendingClose(q)}
                        disabled={closing === q.questionCode}
                        className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-xs text-white whitespace-nowrap"
                      >
                        {closing === q.questionCode ? "…" : "Chốt + chấm"}
                      </button>
                    )}
                  </RowActions>
                </div>
                <div className="flex gap-1 flex-wrap pl-8">
                  {q.options.map((opt, i) => {
                    const letter = LETTERS[i] ?? String(i + 1);
                    const correct = letter === q.correctOption;
                    return (
                      <span
                        key={i}
                        className={`px-2 py-0.5 rounded text-xs font-mono ${
                          correct ? "bg-green-600/25 text-green-200" : "bg-white/5 text-gray-400"
                        }`}
                      >
                        {letter}. {opt}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
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
          standings.map((s) => (
            <div key={s.playerId} className="flex items-center gap-3 py-2 border-b border-white/5 text-sm">
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full font-mono text-xs font-bold ${
                  s.rank === 1
                    ? "bg-yellow-500/25 text-yellow-300"
                    : s.rank === 2
                      ? "bg-gray-400/25 text-gray-200"
                      : s.rank === 3
                        ? "bg-amber-700/30 text-amber-400"
                        : "bg-white/5 text-gray-400"
                }`}
              >
                {s.rank}
              </span>
              <p className="flex-1 text-white">
                {s.userName} <span className="text-gray-500 font-mono text-xs">· {s.userCode}</span>
              </p>
              <span className="font-mono text-xs text-gray-400 hidden sm:inline">{s.correctCount} đúng</span>
              <span className="font-bold text-white font-mono">{s.totalPoints}đ</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
