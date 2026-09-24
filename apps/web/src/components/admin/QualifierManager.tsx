import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lock, Plus, RefreshCw, Trash2, Trophy, XCircle } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { SidePanel } from "@/components/shared/ui/SidePanel";

interface QualifierQuestion {
  id?: string;
  questionCode: string;
  content: string;
  options?: string[];
  correctOption?: string;
  explanation?: string | null;
  position: number;
  status: string;
}

interface StandingRow {
  userCode: string;
  userName: string;
  totalPoints?: number;
  correctCount?: number;
  rank?: number;
}

const inputClass =
  "px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full";

/** Tab Vòng loại: 16 slot câu hỏi VL + chấm + bảng xếp hạng. */
export function QualifierManager({ tournamentCode }: { tournamentCode: string }) {
  const [questions, setQuestions] = useState<QualifierQuestion[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ content: "", options: ["", "", "", ""], correct: "A", explanation: "" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/qualifier/${tournamentCode}/questions`, { credentials: "include" }),
        fetch(`${API_BASE_URL}/qualifier/${tournamentCode}/standings?limit=16`, { credentials: "include" }),
      ]);
      const qJson = await qRes.json().catch(() => null);
      if (qRes.ok && qJson?.status === "success" && Array.isArray(qJson.data)) setQuestions(qJson.data);
      const sJson = await sRes.json().catch(() => null);
      if (sRes.ok && sJson?.status === "success" && Array.isArray(sJson.data)) setStandings(sJson.data);
    } finally {
      setLoading(false);
    }
  }, [tournamentCode]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const byPosition = useMemo(() => {
    const map = new Map(questions.map((q) => [q.position, q]));
    return Array.from({ length: 16 }, (_, i) => map.get(i + 1) ?? null);
  }, [questions]);

  const openCount = questions.filter((q) => q.status === "open").length;

  const handleCloseAll = async () => {
    if (!confirm("Chấm TẤT CẢ câu đang mở?")) return;
    await fetch(`${API_BASE_URL}/qualifier/${tournamentCode}/close-all`, {
      method: "POST",
      credentials: "include",
    });
    await fetchAll();
  };

  const handleClose = async (q: QualifierQuestion) => {
    if (!confirm(`Chấm câu ${q.questionCode}? (công khai đáp án + tính điểm)`)) return;
    const res = await fetch(
      `${API_BASE_URL}/qualifier/${tournamentCode}/questions/${q.questionCode}/close`,
      { method: "POST", credentials: "include" },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) alert(`Lỗi: ${json?.message ?? "?"}`);
    await fetchAll();
  };

  const handleDelete = async (q: QualifierQuestion) => {
    if (!confirm(`Xoá câu ${q.questionCode}?`)) return;
    await fetch(`${API_BASE_URL}/qualifier/${tournamentCode}/questions/${q.questionCode}`, {
      method: "DELETE",
      credentials: "include",
    });
    await fetchAll();
  };

  const handleCreate = async () => {
    const used = new Set(questions.map((q) => q.position));
    const pos = Array.from({ length: 16 }, (_, i) => i + 1).find((p) => !used.has(p));
    if (!pos) {
      alert("Đã đủ 16 câu.");
      return;
    }
    if (!form.content.trim() || form.options.some((o) => !o.trim())) {
      alert("Nhập nội dung + đủ 4 đáp án.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/qualifier/${tournamentCode}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          questionCode: `VL_${String(pos).padStart(2, "0")}`,
          content: form.content.trim(),
          options: form.options.map((o) => o.trim()),
          correctOption: form.correct,
          explanation: form.explanation.trim() || undefined,
          position: pos,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(`Lỗi: ${json?.message ?? "?"}`);
        return;
      }
      setForm({ content: "", options: ["", "", "", ""], correct: "A", explanation: "" });
      setShowForm(false);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm py-8 text-center">Đang tải vòng loại…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Câu hỏi</p>
          <p className="text-xl font-bold">{questions.length}/16</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Đang mở</p>
          <p className="text-xl font-bold text-amber-300">{openCount}</p>
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-3">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Đã chấm</p>
          <p className="text-xl font-bold text-green-300">{questions.length - openCount}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => void fetchAll()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
        >
          <RefreshCw size={14} /> Làm mới
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
        >
          <Plus size={14} /> Thêm câu
        </button>
        {openCount > 0 && (
          <button
            onClick={() => void handleCloseAll()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 text-sm transition-colors"
          >
            <Lock size={14} /> Chấm tất cả
          </button>
        )}
      </div>

      <SidePanel open={showForm} onClose={() => setShowForm(false)} title="Thêm câu vòng loại" wide>
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-gray-500">Câu mới vào vị trí trống đầu tiên.</p>
          <textarea
            rows={3}
            placeholder="Nội dung câu hỏi *"
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            className={`${inputClass} resize-none`}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {form.options.map((o, i) => (
              <label key={i} className="relative block">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">
                  {String.fromCharCode(65 + i)}
                </span>
                <input
                  placeholder={`Đáp án ${String.fromCharCode(65 + i)} *`}
                  value={o}
                  onChange={(e) =>
                    setForm((f) => {
                      const next = [...f.options];
                      next[i] = e.target.value;
                      return { ...f, options: next };
                    })
                  }
                  className={`${inputClass} pl-8`}
                />
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">Đáp án đúng</span>
              <select
                value={form.correct}
                onChange={(e) => setForm((f) => ({ ...f, correct: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm"
              >
                {["A", "B", "C", "D"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">Giải thích</span>
              <input
                placeholder="(tuỳ chọn)"
                value={form.explanation}
                onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
            >
              Huỷ
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? "Đang lưu…" : "Lưu câu hỏi"}
            </button>
          </div>
        </div>
      </SidePanel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {byPosition.map((q, i) =>
          !q ? (
            <div
              key={i}
              className="p-3.5 rounded-xl border border-dashed border-white/10 text-gray-600 text-sm"
            >
              <span className="font-mono font-bold">VL_{String(i + 1).padStart(2, "0")}</span>
              <span className="ml-2 text-xs">Trống</span>
            </div>
          ) : (
            <div
              key={q.questionCode}
              className={`p-3.5 rounded-xl border flex flex-col gap-1.5 ${
                q.status === "closed" ? "bg-green-600/[0.06] border-green-500/20" : "bg-white/[0.03] border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-blue-300">{q.questionCode}</span>
                {q.status === "closed" ? (
                  <span className="flex items-center gap-1 text-[11px] text-green-300">
                    <CheckCircle2 size={12} /> Đã chấm
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-amber-300">
                    <XCircle size={12} /> Mở
                  </span>
                )}
              </div>
              <p className="text-sm text-white line-clamp-2">{q.content}</p>
              <p className="text-[11px] text-gray-500">
                {q.options?.length ?? 0} đáp án · Đúng:{" "}
                <span className="font-bold text-gray-300">{q.correctOption || "?"}</span>
              </p>
              <div className="flex gap-1.5 mt-1">
                {q.status !== "closed" && (
                  <button
                    onClick={() => void handleClose(q)}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 text-xs transition-colors"
                  >
                    Chấm
                  </button>
                )}
                <button
                  onClick={() => void handleDelete(q)}
                  className="px-2 py-1.5 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 text-xs transition-colors"
                  title="Xoá"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {standings.length > 0 && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-300 mb-2">
            <Trophy size={14} className="text-amber-300" /> Bảng xếp hạng vòng loại
          </p>
          <div className="flex flex-col gap-1">
            {standings.slice(0, 8).map((s, i) => (
              <div key={s.userCode} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-sm">
                <span className="w-6 text-xs font-bold text-gray-500">{i + 1}</span>
                <span className="flex-1 text-white truncate">{s.userName || s.userCode}</span>
                <span className="font-mono text-xs text-gray-400">
                  {s.totalPoints ?? s.correctCount ?? ""}đ
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default QualifierManager;
