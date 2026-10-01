import { useCallback, useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { RowActions } from "@/components/shared/RowActions";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { EditBankSidebar, type BankFormKind, type BankFormValue } from "./EditBankSidebar";
import {
  BANK_PAGE_SIZE,
  genBankCode,
  toBankData,
  type BankData,
} from "./bankTypes";
import { uploadQuestionMedia } from "./uploadMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const logger = createLogger("BankTab");

/** Citation: chỉ cần link (tùy chọn). Ngày do OCee đọc link + check sau. */
function citationErrorOf(v: BankFormValue): string {
  if (v.citationUrl.trim() && !/^https?:\/\//i.test(v.citationUrl.trim())) {
    return "Link nguồn phải bắt đầu http(s)://.";
  }
  return "";
}

/** Dựng citations array từ ô link (rỗng = []). */
function buildCitations(v: BankFormValue): { source: string; url: string; accessedAt: string }[] {
  if (!v.citationUrl.trim()) return [];
  return [{
    source: "",
    url: v.citationUrl.trim(),
    accessedAt: "",
  }];
}

export type BankRoundGroup = "kd" | "gm" | "bp" | "vd";

const GROUP_ROUNDS: Record<BankRoundGroup, string> = {
  kd: "KD_C,KD_R",
  gm: "GM",
  bp: "BP",
  vd: "VD",
};

export const BankTab = ({ initialGroup = "kd" }: { initialGroup?: BankRoundGroup }) => {
  const [group] = useState<BankRoundGroup>(initialGroup);
  const [rows, setRows] = useState<BankData[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<"all" | "only" | "unused">("all");
  const [reviewStatus, setReviewStatus] = useState<"" | "pending" | "approved" | "rejected">("");
  const [vdDomain, setVdDomain] = useState("");
  const [vdLevel, setVdLevel] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<BankData | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [sidebar, setSidebar] = useState<{
    mode: "create" | "edit";
    kind: BankFormKind;
    preset?: Partial<BankFormValue>;
    row: BankData | null;
  } | null>(null);

  const fetchBank = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (used !== "all") params.set("used", used);
      if (reviewStatus) params.set("status", reviewStatus);
      const gr = GROUP_ROUNDS[group];
      if (group === "kd") {
        params.set("round_hints", gr);
      } else {
        params.set("round_hint", gr);
      }
      if (group === "vd") {
        if (vdDomain) params.set("domain", vdDomain);
        if (vdLevel) params.set("difficulty", vdLevel);
      }
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", String(p));
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      const data = json.data as {
        rows: Record<string, unknown>[];
        total: number;
        limit: number;
        page: number;
        pages: number;
      } | null;
      if (json.status === "success" && data) {
        setRows((data.rows as Record<string, unknown>[]).map(toBankData));
        setTotal(data.total);
        setPages(data.pages);
        setPage(data.page);
      } else {
        setRows([]);
        setTotal(0);
        setPages(1);
      }
    } catch (err) {
      logger.error("Error fetching bank:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, used, group, vdDomain, vdLevel, reviewStatus]);

  // Matrix/tab đổi là tự tải, khỏi bấm Tìm.
  useEffect(() => {
    void fetchBank(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, vdDomain, vdLevel, reviewStatus]);

  const saveSidebar = useCallback(async (v: BankFormValue) => {
    if (!sidebar) return;
    if (!v.content.trim() || !v.answer.trim()) {
      setFormError("Nhập nội dung và đáp án.");
      return;
    }
    if (sidebar.kind === "vd" && (!v.domain || !v.difficulty)) {
      setFormError("VĐ bắt buộc chọn lĩnh vực + độ khó.");
      return;
    }
    if (sidebar.kind === "gm-hint" && !v.hintIndex) {
      setFormError("Chọn vị trí hint H1..H8.");
      return;
    }
    const citeErr = citationErrorOf(v);
    if (citeErr) {
      setFormError(citeErr);
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      if (sidebar.mode === "create") {
        const roundHint = v.roundHint.trim() || GROUP_ROUNDS[group].split(",")[0];
        const bankCode = genBankCode(roundHint);
        const res = await fetch(`${API_BASE_URL}/bank`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            bankCode,
            content: v.content.trim(),
            answer: v.answer.trim(),
            explanation: v.explanation.trim() || undefined,
            roundHint,
            domain: v.domain || undefined,
            difficulty: v.difficulty ? Number(v.difficulty) : undefined,
            setCode: v.setCode || undefined,
            hintIndex: v.hintIndex || undefined,
            citations: buildCitations(v),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? "Tạo thất bại");
        const id = String(json.data?.id ?? "");
        if (v.mediaFile) {
          const key = await uploadQuestionMedia(bankCode, v.mediaFile);
          await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ media_url: key }),
          });
        }
        setSidebar(null);
        await fetchBank(1);
      } else {
        const row = sidebar.row!;
        const body: Record<string, string | number | object | null> = {
          content: v.content.trim(),
          answer: v.answer.trim(),
          explanation: v.explanation.trim() || null,
          citations: buildCitations(v),
          domain: v.domain || null,
          difficulty: v.difficulty ? Number(v.difficulty) : null,
          setCode: v.setCode || null,
          hintIndex: v.hintIndex || null,
        };
        if (v.mediaFile) {
          body.media_url = await uploadQuestionMedia(row.bank_code, v.mediaFile);
        } else if (v.removeMedia) {
          body.media_url = null;
        }
        const res = await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(row.bank_id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? "Lưu thất bại");
        setSidebar(null);
        await fetchBank(page);
      }
    } catch (err) {
      logger.error("Error saving bank:", err);
      setFormError(err instanceof Error ? err.message : "Lỗi kết nối khi lưu");
    } finally {
      setSaving(false);
    }
  }, [sidebar, fetchBank, page]);

  const confirmDeleteBank = useCallback(async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/bank/${encodeURIComponent(deleting.bank_id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok) {
        setDeleting(null);
        await fetchBank(page);
      } else {
        alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error deleting bank:", err);
      alert("Lỗi kết nối khi xoá bank");
    } finally {
      setDeleteSaving(false);
    }
  }, [deleting, fetchBank, page]);

  return (
    <div className="flex flex-col gap-4">
      <EditBankSidebar
        open={sidebar !== null}
        mode={sidebar?.mode ?? "create"}
        kind={sidebar?.kind ?? "kd"}
        preset={sidebar?.preset}
        initial={sidebar?.row ?? null}
        saving={saving}
        onClose={() => { setSidebar(null); setFormError(""); }}
        onSave={saveSidebar}
      />
      {formError && <p className="text-xs text-destructive">{formError}</p>}
      <ConfirmActionPanel
        open={deleting !== null}
        title="Xoá câu bank?"
        tone="danger"
        itemCode={deleting?.bank_code}
        message={deleting ? `Xoá câu “${deleting.content}” khỏi bank?` : ""}
        confirmLabel="Xoá"
        saving={deleteSaving}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDeleteBank}
      />

      <div className="bg-accent/50 border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          {group === "kd" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ mode: "create", kind: "kd", preset: { roundHint: "KD_C" }, row: null })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu KĐ
            </Button>
          )}
          {group === "bp" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ mode: "create", kind: "bp", preset: { roundHint: "BP" }, row: null })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu BP
            </Button>
          )}
          {group === "vd" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ mode: "create", kind: "vd", preset: { roundHint: "VD", domain: vdDomain, difficulty: vdLevel }, row: null })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu VĐ
            </Button>
          )}
          {group === "gm" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ mode: "create", kind: "gm-key", row: null })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo set GM
            </Button>
          )}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã / nội dung / đáp án…"
            className="flex-1 px-3 py-2 rounded-lg bg-background/60 border border-border text-foreground text-sm"
          />
          <NativeSelect
            value={used}
            onChange={(e) => setUsed(e.target.value as "all" | "only" | "unused")}
          >
            <option value="all">Tất cả</option>
            <option value="unused">Chưa dùng</option>
            <option value="only">Đã dùng</option>
          </NativeSelect>
          <NativeSelect
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value as "" | "pending" | "approved" | "rejected")}
          >
            <option value="">Tất cả</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Không duyệt</option>
          </NativeSelect>
          {group === "vd" && (
            <>
              <NativeSelect
                value={vdDomain}
                onChange={(e) => setVdDomain(e.target.value)}
                className="font-mono"
              >
                <option value="">Mọi lĩnh vực</option>
                {["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={vdLevel}
                onChange={(e) => setVdLevel(e.target.value)}
                className="font-mono"
              >
                <option value="">Mọi mức</option>
                {[20, 30, 40, 50].map((l) => (
                  <option key={l} value={String(l)}>{l}</option>
                ))}
              </NativeSelect>
            </>
          )}
          <Button
            variant="default"
            onClick={() => void fetchBank(1)}
            disabled={loading}
            className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm text-success-foreground"
          >
            <Search size={14} /> Tìm
          </Button>
        </div>
        {group === "gm" && !loading && rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {Object.entries(
              rows.reduce<Record<string, BankData[]>>((acc, r) => {
                const k = r.set_code || "(chưa set)";
                (acc[k] ??= []).push(r);
                return acc;
              }, {}),
            ).map(([setCode, setRows]) => {
              const key = setRows.find((r) => r.hint_index === "KEY");
              const hints = setRows.filter((r) => r.hint_index !== "KEY");
              const have = new Set(hints.map((r) => r.hint_index));
              const missing = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"].filter((h) => !have.has(h));
              return (
                <div key={setCode} className="rounded-lg bg-background/40 border border-border p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-warning">{setCode}</span>
                    {key && <span className="text-sm text-white">KEY: {key.answer}</span>}
                    <span className="text-xs text-muted-foreground">{hints.length}/8 hint{missing.length > 0 && ` · thiếu ${missing.join(",")}`}</span>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setSidebar({ mode: "create", kind: "gm-hint", preset: { roundHint: "GM", setCode: setCode === "(chưa set)" ? "" : setCode }, row: null })}
                      className="ml-auto bg-primary hover:bg-primary/90"
                    >
                      + Thêm hint
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {loading ? (
          <p className="text-muted-foreground text-sm">Đang tải…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">Chưa có dữ liệu bank. Bấm Tìm để tải.</p>
        ) : (
          <>
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow className="border-b border-border hover:bg-transparent">
                  <TableHead className="py-2 px-2 text-success">Mã</TableHead>
                  <TableHead className="py-2 px-2 text-success">Nội dung</TableHead>
                  <TableHead className="py-2 px-2 text-success">Đáp án</TableHead>
                  <TableHead className="py-2 px-2 text-success">Duyệt</TableHead>
                  <TableHead className="py-2 px-2 text-success">Media</TableHead>
                  <TableHead className="py-2 px-2"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((q) => (
                  <TableRow key={q.bank_id} className="border-b border-border/50 align-top hover:bg-transparent">
                    <TableCell className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                      {q.bank_code}
                      {q.round_hint && <span className="ml-1 text-muted-foreground">· {q.round_hint}</span>}
                      {group === "vd" && q.domain && (
                        <span className="ml-1 text-brand">· {q.domain}{q.difficulty ? `_${q.difficulty}` : ""}</span>
                      )}
                      {group === "gm" && q.hint_index && (
                        <span className="ml-1 text-warning">· {q.hint_index}</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2 max-w-xs truncate">{q.content}</TableCell>
                    <TableCell className="py-2 px-2 font-semibold">{q.answer}</TableCell>
                    <TableCell className="py-2 px-2 whitespace-nowrap">
                      {q.status === "approved" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-success/20 text-success">Đã duyệt</span>
                      ) : q.status === "rejected" ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-destructive/20 text-destructive">Không duyệt</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-warning/20 text-warning">Chờ duyệt</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2 font-mono text-xs max-w-48 truncate">
                      {q.media_url ? (
                        <span className="text-success" title={q.media_url}>Có media</span>
                      ) : (
                        <span className="text-muted-foreground">Chưa có</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right">
                      <RowActions
                        onEdit={() => setSidebar({
                          mode: "edit",
                          kind: q.hint_index === "KEY" ? "gm-key"
                            : q.hint_index ? "gm-hint"
                            : group === "vd" ? "vd"
                            : group === "bp" ? "bp" : "kd",
                          row: q,
                        })}
                        onDelete={() => setDeleting(q)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">Trang {page}/{pages} · {total} câu</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => void fetchBank(page - 1)}
                  disabled={loading || page <= 1}
                  className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-xs text-foreground"
                >
                  ← Trước
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void fetchBank(page + 1)}
                  disabled={loading || page >= pages}
                  className="bg-accent hover:bg-accent/80 disabled:opacity-50 text-xs text-foreground"
                >
                  Sau →
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
