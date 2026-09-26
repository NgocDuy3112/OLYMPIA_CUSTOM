import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { SetFillPanel } from "@/components/qauthor/SetFillPanel";
import { useBankEvents } from "@/hooks/useBankEvents";
import { RenderMedia } from "@/components/shared/RenderMedia";

const logger = createLogger("AdminBankReviewPage");

type Status = "pending" | "approved" | "rejected";
type StatusFilter = "" | Status;
type Group = "all" | "kd" | "gm" | "bp" | "vd" | "sets";

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
  citations: { source: string; url: string; accessedAt: string }[];
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
  citations: Array.isArray(r.citations)
    ? (r.citations as Record<string, unknown>[]).map((c) => ({
        source: String(c.source ?? ""),
        url: String(c.url ?? ""),
        accessedAt: String(c.accessedAt ?? c.accessed_at ?? ""),
      }))
    : [],
});

function formatVnDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

const STATUS_VN: Record<StatusFilter, string> = {
  "": "Tất cả",
  pending: "CHỜ DUYỆT",
  approved: "ĐÃ DUYỆT",
  rejected: "KHÔNG DUYỆT",
};

interface SetCard {
  setCode: string;
  setName: string;
  matchCode: string | null;
  status: string;
  activeMatchCode: string | null;
  filled: number;
  expected: number;
}

/** Admin duyệt câu bank: lọc theo trạng thái, ghi chú duyệt, Duyệt/Từ chối. */
const AdminBankReviewPage = () => {
  const [rows, setRows] = useState<BankRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [group, setGroup] = useState<Group>("all");
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sets, setSets] = useState<SetCard[]>([]);
  const [openSetCode, setOpenSetCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<BankRow | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [oceeOpinion, setOceeOpinion] = useState("");
  const [askingOcee, setAskingOcee] = useState(false);

  const fetchRows = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      // Tab Bộ đề: liệt kê sets (phương án a), không search bank.
      if (group === "sets") {
        const res = await fetch(`${API_BASE_URL}/question-sets`, { credentials: "include" });
        const json = await res.json();
        setSets(json.status === "success" && Array.isArray(json.data) ? json.data : []);
        setRows([]);
        setTotal(0);
        setPages(1);
        return;
      }
      const params = new URLSearchParams();
      if (queryRef.current.trim()) params.set("q", queryRef.current.trim());
      if (group === "kd") {
        params.set("round_hints", "KD_C,KD_R");
      } else if (group !== "all") {
        params.set("round_hint", group === "vd" ? "VD" : group === "bp" ? "BP" : "GM");
      }
      if (status) params.set("status", status);
      params.set("limit", "20");
      params.set("page", String(p));
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setRows((json.data.rows as Record<string, unknown>[]).map(toRow));
        setTotal(json.data.total ?? 0);
        setPages(json.data.pages ?? 1);
        setPage(json.data.page ?? p);
      } else {
        setRows([]);
        setTotal(0);
        setPages(1);
      }
    } catch (err) {
      logger.error("Error fetching review queue:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, group]);

  // Event-driven: vào trang tải 1 lần, bank đổi là SSE báo tải lại.
  useBankEvents(fetchRows);
  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

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
      await fetchRows(page);
    } catch (err) {
      logger.error("Error reviewing:", err);
      alert(err instanceof Error ? err.message : "Lỗi kết nối");
    } finally {
      setSaving(false);
    }
  }, [selected, note, fetchRows, page]);

  return (
    <div className="flex flex-col gap-4 min-h-screen text-white">
      <h1 className="flex items-center gap-2 text-xl font-bold text-green-300">
        <ClipboardCheck size={20} /> Duyệt câu bank
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        {(
          [
            { id: "kd", label: "Khởi động", sub: "KĐ chung + riêng" },
            { id: "gm", label: "Giải mã", sub: "Set KEY + 8 hint" },
            { id: "bp", label: "Bứt phá", sub: "4 câu/trận" },
            { id: "vd", label: "Về đích", sub: "6 lĩnh vực × 4 mức" },
            { id: "sets", label: "Bộ đề", sub: "Preset theo trận" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => { setGroup(group === t.id ? "all" : t.id); setSelected(null); }}
            className={`px-4 py-3 rounded-xl border text-left transition-colors ${
              group === t.id
                ? "bg-green-600/20 border-green-600/50 text-green-300"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <span className="block text-base font-semibold">{t.label}</span>
            <span className="block text-xs opacity-70">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as StatusFilter); setSelected(null); }}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
          aria-label="Lọc theo trạng thái duyệt"
        >
          {(["", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
            <option key={s} value={s}>{STATUS_VN[s]}</option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); queryRef.current = e.target.value; }}
          placeholder="Tìm theo mã / nội dung / đáp án…"
          className="flex-1 min-w-40 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
        />
        <button
          onClick={() => void fetchRows(1)}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> {loading ? "Đang tải…" : "Tìm"}
        </button>
      </div>

      <SetFillPanel setCode={openSetCode} onClose={() => setOpenSetCode(null)} onChanged={fetchRows} />

      {group === "sets" ? (
        <div className="flex flex-col gap-2">
          {loading && sets.length === 0 ? (
            <p className="text-gray-400 text-sm py-8 text-center">Đang tải…</p>
          ) : sets.length === 0 ? (
            <p className="text-gray-400 text-sm">Chưa có bộ đề nào.</p>
          ) : (
            sets.map((s) => (
              <button
                key={s.setCode}
                onClick={() => setOpenSetCode(s.setCode)}
                className="text-left px-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/5 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-white">{s.setName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                      s.status === "ready" ? "bg-green-600/20 text-green-300" : "bg-yellow-600/20 text-yellow-300"
                    }`}
                  >
                    {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                  </span>
                  {s.activeMatchCode && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-600/20 text-blue-300">
                      Live {s.activeMatchCode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${s.expected ? Math.min((s.filled / s.expected) * 100, 100) : 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-gray-400 whitespace-nowrap">
                    {s.filled}/{s.expected}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  <span className="font-mono">{s.setCode}</span> · Trận:{" "}
                  <span className="font-mono text-gray-300">{s.matchCode ?? "— chưa gán —"}</span>
                </p>
              </button>
            ))
          )}
        </div>
      ) : (
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col gap-4">
        {loading && rows.length === 0 ? (
          <p className="text-gray-400 text-sm">Đang tải…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có câu nào — danh sách tự cập nhật.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-green-300 border-b border-white/10">
                  <th className="py-2 px-2">Mã</th>
                  <th className="py-2 px-2">Nội dung</th>
                  <th className="py-2 px-2">Đáp án</th>
                  <th className="py-2 px-2">Duyệt</th>
                  <th className="py-2 px-2">Media</th>
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
                    <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                      {r.bankCode}
                      {r.roundHint && <span className="ml-1 text-gray-500">· {r.roundHint}</span>}
                    </td>
                    <td className="py-2 px-2 max-w-xs truncate">{r.content}</td>
                    <td className="py-2 px-2 font-semibold">{r.answer}</td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {r.status === "approved" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-600/20 text-green-300">Đã duyệt</span>
                      ) : r.status === "rejected" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-600/20 text-red-300">Không duyệt</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-600/20 text-yellow-300">Chờ duyệt</span>
                      )}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs max-w-48 truncate">
                      {r.mediaUrl ? (
                        <span className="text-green-300" title={r.mediaUrl}>Có media</span>
                      ) : (
                        <span className="text-gray-500">Chưa có</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500">Trang {page}/{pages} · {total} câu</p>
              <div className="flex gap-2">
                <button
                  onClick={() => void fetchRows(page - 1)}
                  disabled={loading || page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
                >
                  ← Trước
                </button>
                <button
                  onClick={() => void fetchRows(page + 1)}
                  disabled={loading || page >= pages}
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

      <SidePanel
        open={selected !== null}
        onClose={() => { setSelected(null); setNote(""); setOceeOpinion(""); }}
        title="Duyệt câu bank"
        wide
        footer={
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
        }
      >
        {selected && (
        <>
          <p className="font-mono text-sm text-green-300 -mt-2">
            {selected.bankCode}
            {selected.roundHint && <span className="ml-1 text-gray-500">· {selected.roundHint}</span>}
          </p>
          <p className="text-sm">{selected.content}</p>
          <p className="text-sm font-semibold">Đáp án: {selected.answer}</p>
          {selected.explanation && <p className="text-xs text-gray-400">{selected.explanation}</p>}
          {selected.citations.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-gray-400">Nguồn:</p>
              {selected.citations.map((c, i) => (
                <p key={i} className="text-xs text-gray-300 font-mono break-all">
                  {c.source} · {formatVnDate(c.accessedAt)}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-300 underline">{c.url}</a></>}
                </p>
              ))}
            </div>
          )}
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
        </>
        )}
      </SidePanel>
    </div>
  );
};

export default AdminBankReviewPage;
