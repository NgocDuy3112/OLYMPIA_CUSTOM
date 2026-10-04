import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { ApiError, apiGetOrNull, apiSend } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { EditBankSidePanel, type BankFormKind, type BankFormValue } from "./EditBankSidePanel";
import {
  BANK_PAGE_SIZE,
  genBankCode,
  toBankData,
  type BankData,
} from "./bankTypes";
import { uploadQuestionMedia } from "./uploadMedia";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DataTable,
  DataTablePager,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
  type DataTableColumn,
} from "@/components/shared/data-table-core";
import { BankCardGrid } from "./BankCardGrid";

const logger = createLogger("BankTab");

const helper = createDataTableColumns<BankData>();


function citationErrorOf(v: BankFormValue): string {
  if (v.citationUrl.trim() && !/^https?:\/\//i.test(v.citationUrl.trim())) {
    return "Link nguồn phải bắt đầu bằng http(s)://.";
  }
  return "";
}

function buildCitations(v: BankFormValue): { source: string; url: string; accessedAt: string }[] {
  if (!v.citationUrl.trim()) return [];
  return [{
    source: "",
    url: v.citationUrl.trim(),
    accessedAt: "",
  }];
}

export type BankRoundGroup = "kd" | "gm" | "bp" | "vd";

type BankFilters = {
  query: string;
  used: "all" | "only" | "unused";
  reviewStatus: "" | "pending" | "approved" | "rejected";
  vdDomain: string;
  vdLevel: string;
};

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
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [used, setUsed] = useState<"all" | "only" | "unused">("all");
  const [reviewStatus, setReviewStatus] = useState<"" | "pending" | "approved" | "rejected">("");
  const [vdDomain, setVdDomain] = useState("");
  const [vdLevel, setVdLevel] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [bankView, setBankView] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem("bank_view") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const changeView = (v: "list" | "grid") => {
    setBankView(v);
    try {
      localStorage.setItem("bank_view", v);
    } catch {
    }
  };
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [sidebar, setSidebar] = useState<{
    kind: BankFormKind;
    preset?: Partial<BankFormValue>;
  } | null>(null);

  const loadBank = useCallback(async (p: number, f: BankFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.query) params.set("q", f.query);
      if (f.used !== "all") params.set("used", f.used);
      if (f.reviewStatus) params.set("status", f.reviewStatus);
      const gr = GROUP_ROUNDS[group];
      if (group === "kd") {
        params.set("round_hints", gr);
      } else {
        params.set("round_hint", gr);
      }
      if (group === "vd") {
        if (f.vdDomain) params.set("domain", f.vdDomain);
        if (f.vdLevel) params.set("difficulty", f.vdLevel);
      }
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", String(p));
      const json = await apiGetOrNull<{
        rows: Record<string, unknown>[];
        total: number;
        limit: number;
        page: number;
        pages: number;
      }>(`/bank/search?${params.toString()}`);
      const data = json?.data ?? null;
      if (data) {
        setRows(data.rows.map(toBankData));
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
  }, [group]);

  const filters = useMemo<BankFilters>(
    () => ({ query, used, reviewStatus, vdDomain, vdLevel }),
    [query, used, reviewStatus, vdDomain, vdLevel],
  );

  useEffect(() => {
    void loadBank(1, filters);
  }, [loadBank, filters]);

  const applySearch = useCallback(() => {
    const next = queryInput.trim();
    if (next === query) {
      void loadBank(1, filters);
      return;
    }
    setQuery(next);
  }, [queryInput, query, loadBank, filters]);

  const refreshBank = useCallback(
    () => loadBank(1, filters),
    [loadBank, filters],
  );

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
      const roundHint = v.roundHint.trim() || GROUP_ROUNDS[group].split(",")[0];
      const bankCode = genBankCode(roundHint);
      const payload = {
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
      };
      const json = await apiSend<{ id?: string }>("POST", "/bank", payload);
      const id = String(json.data?.id ?? "");
      if (v.mediaFile) {
        setUploadPct(0);
        const key = await uploadQuestionMedia(bankCode, v.mediaFile, setUploadPct);
        await apiSend("PATCH", `/bank/${encodeURIComponent(id)}`, {
          media_url: key,
        }).catch((error: unknown) => {
          // Như bản cũ: HTTP lỗi thì bỏ qua để không chặn đóng panel, lỗi mạng vẫn nổi lên form.
          if (error instanceof ApiError) return;
          throw error;
        });
      }
      setSidebar(null);
      await refreshBank();
    } catch (err) {
      logger.error("Error saving bank:", err);
      setFormError(err instanceof Error ? err.message : "Lỗi kết nối khi lưu");
    } finally {
      setSaving(false);
      setUploadPct(null);
    }
  }, [sidebar, refreshBank, group]);


  const columns: DataTableColumn<BankData>[] = React.useMemo(() => {
    const h = helper;
    return [
      h.accessor("bank_code", {
        header: "Mã",
        cell: (info) => {
          const q = info.row.original;
          return (
            <span className="whitespace-nowrap  text-xs">
              {q.bank_code}
              {q.round_hint && (
                <span className="ml-1 text-muted-foreground">· {q.round_hint}</span>
              )}
              {group === "vd" && q.domain && (
                <span className="ml-1 text-brand">
                  · {q.domain}
                  {q.difficulty ? `_${q.difficulty}` : ""}
                </span>
              )}
              {group === "gm" && q.hint_index && (
                <span className="ml-1 text-warning">· {q.hint_index}</span>
              )}
            </span>
          );
        },
      }),
      h.accessor("content", {
        header: "Nội dung",
        cell: (info) => (
          <span className="block max-w-xs truncate">{info.getValue()}</span>
        ),
      }),
      h.accessor("answer", {
        header: "Đáp án",
        cell: (info) => <span className="font-semibold">{info.getValue()}</span>,
      }),
      h.accessor("status", {
        header: "Duyệt",
        cell: (info) => {
          const st = info.getValue();
          if (st === "approved") {
            return (
              <span className="whitespace-nowrap rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
                Đã duyệt
              </span>
            );
          }
          if (st === "rejected") {
            return (
              <span className="whitespace-nowrap rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                Không duyệt
              </span>
            );
          }
          return (
            <span className="whitespace-nowrap rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
              Chờ duyệt
            </span>
          );
        },
      }),
      h.accessor("media_url", {
        header: "Media",
        enableSorting: false,
        cell: (info) =>
          info.getValue() ? (
            <span
              className=" text-xs text-success"
              title={info.getValue()!}
            >
              Có media
            </span>
          ) : (
            <span className=" text-xs text-muted-foreground">Chưa có</span>
          ),
      }),
    ];
  }, [group]);

  return (
    <div className="flex flex-col gap-4">
      <EditBankSidePanel
        open={sidebar !== null}
        mode="create"
        kind={sidebar?.kind ?? "kd"}
        preset={sidebar?.preset}
        initial={null}
        saving={saving}
        uploadPct={uploadPct}
        onClose={() => { setSidebar(null); setFormError(""); }}
        onSave={saveSidebar}
      />
      {formError && <p className="text-xs text-destructive">{formError}</p>}

      <div className="bg-accent/50 border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          {group === "kd" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ kind: "kd", preset: { roundHint: "KD_C" } })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu KĐ
            </Button>
          )}
          {group === "bp" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ kind: "bp", preset: { roundHint: "BP" } })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu BP
            </Button>
          )}
          {group === "vd" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ kind: "vd", preset: { roundHint: "VD", domain: vdDomain, difficulty: vdLevel } })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo câu VĐ
            </Button>
          )}
          {group === "gm" && (
            <Button
              variant="default"
              onClick={() => setSidebar({ kind: "gm-key" })}
              className="gap-2 bg-success hover:bg-success/90 font-semibold text-sm text-success-foreground"
            >
              <Plus size={16} /> Tạo set GM
            </Button>
          )}
          <InputGroup className="h-9 flex-1">
            <InputGroupInput
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Tìm theo mã / nội dung / đáp án…"
              className="text-sm"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                variant="default"
                onClick={applySearch}
                disabled={loading}
                className="disabled:opacity-50 text-sm"
              >
                <Search size={14} /> Tìm
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {group !== "gm" && (
            <div
              className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5"
              role="group"
              aria-label="Kiểu xem danh sách bank"
            >
              <Button
                size="icon-sm"
                variant={bankView === "list" ? "secondary" : "ghost"}
                onClick={() => changeView("list")}
                aria-label="Xem dạng danh sách"
                aria-pressed={bankView === "list"}
                title="Danh sách"
              >
                <List size={15} />
              </Button>
              <Button
                size="icon-sm"
                variant={bankView === "grid" ? "secondary" : "ghost"}
                onClick={() => changeView("grid")}
                aria-label="Xem dạng lưới"
                aria-pressed={bankView === "grid"}
                title="Lưới"
              >
                <LayoutGrid size={15} />
              </Button>
            </div>
          )}
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
                className=""
              >
                <option value="">Mọi lĩnh vực</option>
                {["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </NativeSelect>
              <NativeSelect
                value={vdLevel}
                onChange={(e) => setVdLevel(e.target.value)}
                className=""
              >
                <option value="">Mọi mức</option>
                {[20, 30, 40, 50].map((l) => (
                  <option key={l} value={String(l)}>{l}</option>
                ))}
              </NativeSelect>
            </>
          )}
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
                    <span className=" text-sm text-warning">{setCode}</span>
                    {key && <span className="text-sm text-foreground">KEY: {key.answer}</span>}
                    <span className="text-xs text-muted-foreground">{hints.length}/8 hint{missing.length > 0 && ` · thiếu ${missing.join(",")}`}</span>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setSidebar({ kind: "gm-hint", preset: { roundHint: "GM", setCode: setCode === "(chưa set)" ? "" : setCode } })}
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
        <p className="text-xs text-muted-foreground">{total} câu</p>
        {group !== "gm" && bankView === "grid" ? (
          <BankCardGrid
            rows={rows}
            loading={loading}
            emptyText="Chưa có dữ liệu bank. Bấm Tìm để tải."
            pager={
              <DataTablePager
                page={page - 1}
                count={Math.max(1, pages)}
                go={(p) => void loadBank(p + 1, filters)}
              />
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            loading={loading}
            emptyText="Chưa có dữ liệu bank. Bấm Tìm để tải."
            serverPagination={{
              page: page - 1,
              pageCount: pages,
              onPageChange: (p) => void loadBank(p + 1, filters),
            }}
          />
        )}
      </div>
    </div>
  );
};
