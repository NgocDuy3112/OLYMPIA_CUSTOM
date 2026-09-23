import { useCallback, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { RenderMedia } from "@/components/shared/RenderMedia";

const logger = createLogger("AdminBankReviewPage");

type Status = "pending" | "approved" | "rejected";

interface BankRow {
  id: string;
  bankCode: string;
  content: string;
  answer: string;
  explanation: string | null;
  mediaUrl: string | null;
  roundHint: string | null;
  status: Status;
  reviewNote: string | null;
}

const toRow = (r: Record<string, unknown>): BankRow => ({
  id: String(r.id ?? ""),
  bankCode: String(r.bankCode ?? r.bank_code ?? ""),
  content: String(r.content ?? ""),
  answer: String(r.answer ?? ""),
  explanation: (r.explanation as string | null) ?? null,
  mediaUrl: (r.mediaUrl as string | null) ?? (r.media_url as string | null) ?? null,
  roundHint: (r.roundHint as string | null) ?? (r.round_hint as string | null) ?? null,
  status: String(r.status ?? "pending") as Status,
  reviewNote: (r.reviewNote as string | null) ?? (r.review_note as string | null) ?? null,
});

const STATUS_VN: Record<Status, string> = {
  pending: "CHỜ DUYỆT",
  approved: "ĐÃ DUYỆT",
  rejected: "KHÔNG DUYỆT",
};

/** Admin duyệt câu bank: lọc theo trạng thái, ghi chú duyệt, Duyệt/Từ chối. */
const AdminBankReviewPage = () => {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<Status>("pending");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BankRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [oceeOpinion, setOceeOpinion] = useState("");
  const [askingOcee, setAskingOcee] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, limit: "50", page: "1" });
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setRows((json.data.rows as Record<string, unknown>[]).map(toRow));
        setTotal(json.data.total ?? 0);
      } else {
        setRows([]);
        setTotal(0);
      }
    } catch (err) {
      logger.error("Error fetching review queue:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  const askOcee = useCallback(async () => {
    if (!selected || askingOcee) return;
    setAskingOcee(true);
    setOceeOpinion("");
    try {
      const res = await fetch(`${API_BASE_URL}/agent/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          question: `Cho ý kiến duyệt câu bank ${selected.bankCode}: nội dung "${selected.content}", đáp án "${selected.answer}".`,
        }),
      });
      const json = await res.json().catch(() => null);
      setOceeOpinion(
        res.ok && json?.status === "success"
          ? String(json.data?.answer ?? "(trống)")
          : `Lỗi: ${json?.message ?? `HTTP ${res.status}`}`,
      );
    } catch (err) {
      logger.error("Error asking OCee:", err);
      setOceeOpinion("Lỗi kết nối OCee.");
    } finally {
      setAskingOcee(false);
    }
  }, [selected, askingOcee]);

  const review = useCallback(async (decision: "approved" | "rejected") => {
    if (!selected) return;
    if (decision === "rejected" && !note.trim()) {
      alert("Từ chối phải ghi chú thích.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/bank/${encodeURIComponent(selected.id)}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ decision, note: note.trim() || undefined }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Duyệt thất bại");
      setSelected(null);
      setNote("");
      setOceeOpinion("");
      await fetchRows();
    } catch (err) {
      logger.error("Error reviewing:", err);
      alert(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }, [selected, note, fetchRows]);

  return (
    <div className="flex flex-col gap-4 min-h-screen text-white">
      <h1 className="flex items-center gap-2 text-xl font-bold text-green-300">
        <ClipboardCheck size={20} /> Duyệt câu bank
      </h1>

      <div className="flex gap-2">
        {(["pending", "approved", "rejected"] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setSelected(null); }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              status === s ? "bg-green-600/20 text-green-300" : "text-gray-400 hover:text-white bg-white/5"
            }`}
          >
            {STATUS_VN[s]}
          </button>
        ))}
        <button
          onClick={() => void fetchRows()}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm"
        >
          <Search size={14} /> {loading ? "Đang tải…" : `Tải (${total})`}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400 text-sm">Không có câu nào. Bấm Tải.</p>
      ) : (
        <table className="w-full text-sm bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <thead>
            <tr className="text-left text-green-300 border-b border-white/10">
              <th className="py-2 px-2">Mã</th>
              <th className="py-2 px-2">Nội dung</th>
              <th className="py-2 px-2">Đáp án</th>
              <th className="py-2 px-2">Ghi chú duyệt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => { setSelected(r); setNote(r.reviewNote ?? ""); setOceeOpinion(""); }}
                className={`border-b border-white/5 align-top cursor-pointer hover:bg-white/5 ${
                  selected?.id === r.id ? "bg-green-600/10" : ""
                }`}
              >
                <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">{r.bankCode}</td>
                <td className="py-2 px-2 max-w-xs truncate">{r.content}</td>
                <td className="py-2 px-2 font-semibold">{r.answer}</td>
                <td className="py-2 px-2 text-gray-400 max-w-xs truncate">{r.reviewNote ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-3">
          <p className="font-mono text-sm text-green-300">
            {selected.bankCode}
            {selected.roundHint && <span className="ml-1 text-gray-500">· {selected.roundHint}</span>}
          </p>
          <p className="text-sm">{selected.content}</p>
          <p className="text-sm font-semibold">Đáp án: {selected.answer}</p>
          {selected.explanation && <p className="text-xs text-gray-400">{selected.explanation}</p>}
          {selected.mediaUrl && (
            <div className="rounded-lg bg-black/30 border border-white/10 p-3 max-h-64 overflow-hidden">
              <RenderMedia mediaUrl={selected.mediaUrl} />
            </div>
          )}
          <label className="text-xs text-gray-400">Chú thích người duyệt * (bắt buộc khi từ chối)</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm resize-none"
          />
          {oceeOpinion && (
            <div className="rounded-lg bg-blue-950/60 border border-blue-700 p-3">
              <p className="text-xs text-blue-300 mb-1">Ý kiến OCee:</p>
              <p className="text-xs text-gray-200 whitespace-pre-wrap">{oceeOpinion}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => void askOcee()}
              disabled={askingOcee || saving}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-sm"
            >
              {askingOcee ? "Đang hỏi…" : "Nhờ OCee kiểm tra"}
            </button>
            <button
              onClick={() => void review("rejected")}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? "…" : "Không duyệt"}
            </button>
            <button
              onClick={() => void review("approved")}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? "…" : "Đã duyệt"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBankReviewPage;
