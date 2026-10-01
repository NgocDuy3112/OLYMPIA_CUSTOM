import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { SetFillPanel } from "@/components/qauthor/SetFillPanel";
import { useBankEvents } from "@/hooks/useBankEvents";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  DataTable,
  createDataTableColumns,
} from "@/components/shared/data-table";

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

const helper = createDataTableColumns<BankRow>();

const columns = helper.columns([
  helper.accessor("bankCode", {
    header: "Mã",
    cell: (info) => (
      <span className="whitespace-nowrap font-mono text-xs">
        {info.getValue()}
        {info.row.original.roundHint && (
          <span className="ml-1 text-muted-foreground">
            · {info.row.original.roundHint}
          </span>
        )}
      </span>
    ),
  }),
  helper.accessor("content", {
    header: "Nội dung",
    cell: (info) => (
      <span className="block max-w-xs truncate">{info.getValue()}</span>
    ),
  }),
  helper.accessor("answer", {
    header: "Đáp án",
    cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
  }),
  helper.accessor("status", {
    header: "Duyệt",
    cell: (info) => {
      const st = info.getValue();
      if (st === "approved") {
        return (
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
            Đã duyệt
          </span>
        );
      }
      if (st === "rejected") {
        return (
          <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
            Không duyệt
          </span>
        );
      }
      return (
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
          Chờ duyệt
        </span>
      );
    },
  }),
  helper.accessor("mediaUrl", {
    header: "Media",
    enableSorting: false,
    cell: (info) =>
      info.getValue() ? (
        <span className="font-mono text-xs text-success" title={info.getValue()!}>
          Có media
        </span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">Chưa có</span>
      ),
  }),
]);

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
    <div className="flex flex-col gap-4 min-h-screen text-foreground">
      <h1 className="flex items-center gap-2 text-xl font-bold text-success">
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
          <Button
            key={t.id}
            variant="ghost"
            onClick={() => { setGroup(group === t.id ? "all" : t.id); setSelected(null); }}
            className={`h-auto flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left ${
              group === t.id
                ? "bg-success/20 border-success/50 text-success"
                : "bg-accent/50 border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <span className="block text-base font-semibold">{t.label}</span>
            <span className="block text-xs opacity-70">{t.sub}</span>
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <NativeSelect
          value={status}
          onChange={(e) => { setStatus(e.target.value as StatusFilter); setSelected(null); }}
          aria-label="Lọc theo trạng thái duyệt"
        >
          {(["", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
            <option key={s} value={s}>{STATUS_VN[s]}</option>
          ))}
        </NativeSelect>
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); queryRef.current = e.target.value; }}
          placeholder="Tìm theo mã / nội dung / đáp án…"
          className="min-w-40 flex-1 px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground text-sm"
        />
        <Button
          variant="default"
          onClick={() => void fetchRows(1)}
          disabled={loading}
          className="gap-1 bg-success/80 hover:bg-success disabled:opacity-50 text-sm text-success-foreground"
        >
          <Search size={14} /> {loading ? "Đang tải…" : "Tìm"}
        </Button>
      </div>

      <SetFillPanel setCode={openSetCode} onClose={() => setOpenSetCode(null)} onChanged={fetchRows} />

      {group === "sets" ? (
        <div className="flex flex-col gap-2">
          {loading && sets.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Đang tải…</p>
          ) : sets.length === 0 ? (
            <p className="text-muted-foreground text-sm">Chưa có bộ đề nào.</p>
          ) : (
            sets.map((s) => (
              <Button
                key={s.setCode}
                variant="ghost"
                onClick={() => setOpenSetCode(s.setCode)}
                className="h-auto flex-col items-stretch px-4 py-3.5 text-left rounded-xl bg-accent/25 border border-border hover:bg-accent/50 hover:border-border"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{s.setName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] ${
                      s.status === "ready" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                    }`}
                  >
                    {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                  </span>
                  {s.activeMatchCode && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-primary/20 text-brand">
                      Live {s.activeMatchCode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-accent overflow-hidden">
                    <div
                      className="h-full rounded-full bg-success transition-all"
                      style={{ width: `${s.expected ? Math.min((s.filled / s.expected) * 100, 100) : 0}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {s.filled}/{s.expected}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{s.setCode}</span> · Trận:{" "}
                  <span className="font-mono text-foreground/80">{s.matchCode ?? "— chưa gán —"}</span>
                </p>
              </Button>
            ))
          )}
        </div>
      ) : (
      <div className="bg-accent/50 border border-border rounded-xl p-5 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">{total} câu</p>
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          emptyText="Chưa có câu nào — danh sách tự cập nhật."
          serverPagination={{
            page: page - 1,
            pageCount: pages,
            onPageChange: (p) => void fetchRows(p + 1),
          }}
          onRowClick={(r) => {
            setSelected(r);
            setNote(r.reviewNote ?? "");
            setOceeOpinion("");
          }}
          rowClassName={(r) => (selected?.id === r.id ? "bg-success/10" : undefined)}
        />
      </div>
      )}

      <SidePanel
        open={selected !== null}
        onClose={() => { setSelected(null); setNote(""); setOceeOpinion(""); }}
        title="Duyệt câu bank"
        wide
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => void askOcee()}
              disabled={askingOcee || saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-sm"
            >
              {askingOcee ? "Đang hỏi…" : "Nhờ OCee kiểm tra"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void review("rejected")}
              disabled={saving}
              className="bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-sm font-semibold"
            >
              {saving ? "…" : "Không duyệt"}
            </Button>
            <Button
              variant="default"
              onClick={() => void review("approved")}
              disabled={saving}
              className="bg-success hover:bg-success/90 disabled:opacity-50 text-sm font-semibold text-success-foreground"
            >
              {saving ? "…" : "Đã duyệt"}
            </Button>
          </div>
        }
      >
        {selected && (
        <>
          <p className="font-mono text-sm text-success -mt-2">
            {selected.bankCode}
            {selected.roundHint && <span className="ml-1 text-muted-foreground">· {selected.roundHint}</span>}
          </p>
          <p className="text-sm">{selected.content}</p>
          <p className="text-sm font-semibold">Đáp án: {selected.answer}</p>
          {selected.explanation && <p className="text-xs text-muted-foreground">{selected.explanation}</p>}
          {selected.citations.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Nguồn:</p>
              {selected.citations.map((c, i) => (
                <p key={i} className="text-xs text-foreground/80 font-mono break-all">
                  {c.source} · {formatVnDate(c.accessedAt)}{c.url && <> · <a href={c.url} target="_blank" rel="noreferrer" className="text-brand underline">{c.url}</a></>}
                </p>
              ))}
            </div>
          )}
          {selected.mediaUrl && (
            <div className="rounded-lg bg-background/60 border border-border p-3 max-h-64 overflow-hidden">
              <RenderMedia mediaUrl={selected.mediaUrl} />
            </div>
          )}
          <label className="text-xs text-muted-foreground">Chú thích người duyệt * (bắt buộc khi từ chối)</label>
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground text-sm resize-none"
          />
          {oceeOpinion && (
            <div className="rounded-lg bg-background/60 border border-primary/70 p-3">
              <p className="text-xs text-brand mb-1">Ý kiến OCee:</p>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap">{oceeOpinion}</p>
            </div>
          )}
        </>
        )}
      </SidePanel>
    </div>
  );
};

export default AdminBankReviewPage;
