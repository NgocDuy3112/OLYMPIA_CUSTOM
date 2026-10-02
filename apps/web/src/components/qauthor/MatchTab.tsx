import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { normalizeQuestionRow } from "@/utils/questionMapper";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { MatchQuestionCreatePanel, type MatchQuestionCreateValue } from "./MatchQuestionCreatePanel";
import { toBankData, type BankData } from "./bankTypes";
import {
  DataTable,
  createDataTableColumns,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

const logger = createLogger("MatchTab");

const bankHelper = createDataTableColumns<BankData>();

interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  hintText?: string | null;
  media_url: string | null;
  options?: string | null;
  slot: string | null;
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
    slot: (row.slot as string | null) ?? null,
  };
};

type PickRound = "KDC" | "KDR" | "GM" | "BP" | "VD";

/** Slot từng vòng. KDR lượt i = thí sinh vị trí i (map lúc pick). */
function slotsFor(round: PickRound): string[] {
  if (round === "KDC") return [1, 2, 3, 4, 5, 6].map((i) => `KDC_${i}`);
  if (round === "BP") return [1, 2, 3, 4].map((i) => `BP_${i}`);
  if (round === "GM") return ["GM_KEY", "GM_H1", "GM_H2", "GM_H3", "GM_H4", "GM_H5", "GM_H6", "GM_H7", "GM_H8"];
  if (round === "VD") {
    const out: string[] = [];
    for (const d of ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"]) {
      for (const l of [20, 30, 40, 50]) out.push(`VD_${d}_${l}`);
    }
    return out;
  }
  const out: string[] = [];
  for (let t = 1; t <= 4; t++) for (let i = 1; i <= 6; i++) out.push(`KDR${t}_${i}`);
  return out;
}

/** Suy vòng từ slot — chọn ô bất kỳ sẽ lọc bank theo vòng đó. */
const roundOfSlot = (slot: string): PickRound =>
  slot.startsWith("KDC")
    ? "KDC"
    : slot.startsWith("KDR")
      ? "KDR"
      : slot.startsWith("GM")
        ? "GM"
        : slot.startsWith("BP")
          ? "BP"
          : "VD";

/** Nhãn ngắn trên ô slot. */
const tileLabel = (slot: string): string =>
  slot.startsWith("KDR")
    ? slot.slice(5)
    : slot.startsWith("GM")
      ? slot.replace("GM_", "")
      : slot.startsWith("VD")
        ? slot.split("_")[2] ?? slot
        : slot.replace(/^(KDC_|BP_)/, "");

/** Nhóm con theo vòng (KDR 4 lượt, VD 6 lĩnh vực, còn lại 1 nhóm). */
const groupsForRound = (
  round: PickRound,
): { label?: string; slots: string[] }[] => {
  if (round === "KDR") {
    return [1, 2, 3, 4].map((t) => ({
      label: `Lượt ${t}`,
      slots: slotsFor("KDR").filter((x) => x.startsWith(`KDR${t}_`)),
    }));
  }
  if (round === "VD") {
    return ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"].map((d) => ({
      label: d,
      slots: slotsFor("VD").filter((x) => x.startsWith(`VD_${d}_`)),
    }));
  }
  return [{ slots: slotsFor(round) }];
};

const ROUND_OF_SLOT: Record<PickRound, string> = {
  KDC: "KD_C",
  KDR: "KD_R",
  GM: "GM",
  BP: "BP",
  VD: "VD",
};

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

export const MatchTab = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<BankData[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankQuery, setBankQuery] = useState("");
  const [bankQueryDebounced, setBankQueryDebounced] = useState("");
  const [bankTotal, setBankTotal] = useState(0);
  const [selSlot, setSelSlot] = useState<string | null>(null);
  /** Vòng của slot đang chọn — null = bank hiển thị tất cả. */
  const bankRound: PickRound | null = selSlot ? roundOfSlot(selSlot) : null;
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<QuestionData | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [pendingGmSet, setPendingGmSet] = useState<BankData | null>(null);

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

  // Tự tải 1 lần khi mount nếu đã có mã trận lưu sẵn (trước: phải bấm Tải thủ công).
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (matchCode.trim()) void fetchQuestions();
  }, [fetchQuestions, matchCode]);

  const createQuestion = useCallback(async (value: MatchQuestionCreateValue) => {
    const code = matchCode.trim();
    if (!code || !value.questionCode.trim() || !value.content.trim() || !value.answer.trim()) {
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
          questionCode: value.questionCode.trim(),
          content: value.content.trim(),
          answer: value.answer.trim(),
          explanation: value.explanation.trim() || undefined,
          hintText: value.hintText.trim() || undefined,
          mediaUrl: value.mediaUrl.trim() || undefined,
          options: value.options.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowCreate(false);
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
  }, [fetchQuestions, matchCode]);

  const confirmDeleteQuestion = useCallback(async () => {
    if (!deleting) return;
    const code = matchCode.trim();
    setDeleteSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/questions/${encodeURIComponent(code)}/${encodeURIComponent(deleting.question_code)}`,
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
      logger.error("Error deleting question:", err);
      alert("Lỗi kết nối khi xoá câu hỏi");
    } finally {
      setDeleteSaving(false);
    }
  }, [deleting, fetchQuestions, matchCode]);

  /**
   * Mặc định: toàn bộ bank đã duyệt (limit 100 = server cap).
   * Chọn ô slot → lọc đúng vòng (VĐ lọc cả ô matrix domain/difficulty).
   * `qOverride` cho nút Tìm (fetch ngay với chuỗi đang gõ, không chờ debounce).
   */
  const fetchBank = useCallback(
    async (qOverride?: string) => {
      const q = qOverride ?? bankQueryDebounced;
      setBankLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (selSlot) {
          params.set("round_hint", ROUND_OF_SLOT[roundOfSlot(selSlot)]);
          if (roundOfSlot(selSlot) === "VD") {
            const m = /^VD_([A-Z]+)_(\d+)$/.exec(selSlot);
            if (m) {
              params.set("domain", m[1]);
              params.set("difficulty", m[2]);
            }
          }
        }
        params.set("status", "approved");
        params.set("limit", "100");
        params.set("page", "1");
        const res = await fetch(
          `${API_BASE_URL}/bank/search?${params.toString()}`,
          { credentials: "include" },
        );
        const json = await res.json();
        const data = json.data as
          | { rows: Record<string, unknown>[]; total?: number }
          | null;
        if (json.status === "success" && data) {
          setBankQuestions(
            (data.rows as Record<string, unknown>[]).map(toBankData),
          );
          setBankTotal(data.total ?? data.rows.length);
        } else {
          setBankQuestions([]);
          setBankTotal(0);
        }
      } catch (err) {
        logger.error("Error fetching bank:", err);
        setBankQuestions([]);
        setBankTotal(0);
      } finally {
        setBankLoading(false);
      }
    },
    [bankQueryDebounced, selSlot],
  );

  // Gõ tìm → 300ms ngừng gõ là fetch; đổi slot cũng fetch lại (danh sách tự cập nhật).
  useEffect(() => {
    const t = window.setTimeout(
      () => setBankQueryDebounced(bankQuery),
      300,
    );
    return () => window.clearTimeout(t);
  }, [bankQuery]);

  useEffect(() => {
    void fetchBank();
  }, [fetchBank]);

  const reuseFromBank = useCallback(async (q: BankData, slotOverride?: string) => {
    const code = matchCode.trim();
    if (!code) {
      alert("Nhập mã trận đấu hiện tại trước khi thêm vào trận.");
      return;
    }
    const slot = slotOverride ?? selSlot;
    if (!slot) {
      alert("Chọn 1 slot trống trong lưới vòng trước.");
      return;
    }
    const round = ROUND_OF_SLOT[roundOfSlot(slot)];
    setAddingId(q.bank_code);
    try {
      const res = await fetch(`${API_BASE_URL}/questions/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ matchCode: code, bankCode: q.bank_code, round, slot }),
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
  }, [fetchQuestions, matchCode, selSlot]);

  const confirmPickGmSet = useCallback(async () => {
    const code = matchCode.trim();
    if (!pendingGmSet?.set_code) return;
    if (!code) {
      alert("Nhập mã trận trước khi pick set.");
      return;
    }
    setAddingId(pendingGmSet.bank_code);
    try {
      const res = await fetch(`${API_BASE_URL}/questions/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ matchCode: code, round: "GM", setCode: pendingGmSet.set_code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(`Pick set thất bại: ${json?.message ?? "Lỗi không xác định"}`);
        return;
      }
      const created = (json?.data?.created ?? []) as { slot: string; questionCode: string }[];
      setAddedCodes((prev) => new Set([...prev, pendingGmSet.bank_code]));
      setPendingGmSet(null);
      alert(`Đã pick set ${pendingGmSet.set_code} (${created.length} câu).`);
      await fetchQuestions();
    } catch (err) {
      logger.error("Error picking GM set:", err);
      alert("Lỗi kết nối khi pick set");
    } finally {
      setAddingId(null);
    }
  }, [fetchQuestions, matchCode, pendingGmSet]);

  const ROUND_META: { id: PickRound; label: string }[] = [
    { id: "KDC", label: "KĐ chung" },
    { id: "KDR", label: "KĐ riêng" },
    { id: "GM", label: "Giải mã" },
    { id: "BP", label: "Bứt phá" },
    { id: "VD", label: "Về đích" },
  ];

  const roundProgress = (r: PickRound): string => {
    const slots = slotsFor(r);
    const n = slots.filter((s) => questions.some((q) => q.slot === s)).length;
    return `${n}/${slots.length}`;
  };

  const bankColumns: DataTableColumn<BankData>[] = React.useMemo(
    () => [
      bankHelper.accessor("bank_code", {
        header: "Câu hỏi",
        cell: (info) => {
          const q = info.row.original;
          return (
            <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <code className="font-mono text-xs text-success">
                  {q.bank_code}
                </code>
                {q.hint_index && (
                  <code className="font-mono text-xs text-warning">
                    {q.hint_index}
                  </code>
                )}
                {q.domain && (
                  <code className="font-mono text-xs text-brand">
                    {q.domain}
                    {q.difficulty ? `_${q.difficulty}` : ""}
                  </code>
                )}
              </span>
              <span className="truncate text-sm text-foreground">
                {q.content}
              </span>
            </span>
          );
        },
      }),
      bankHelper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (info) => {
          const q = info.row.original;
          const added = addedCodes.has(q.bank_code);
          const adding = addingId === q.bank_code;
          return (
            <span className="flex items-center justify-end gap-2">
              {q.hint_index === "KEY" && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setPendingGmSet(q)}
                  disabled={adding}
                  className="disabled:opacity-50"
                >
                  {adding ? "…" : "Pick cả set"}
                </Button>
              )}
              {q.hint_index && q.hint_index !== "KEY" && (
                <Button
                  size="xs"
                  variant="outline"
                  disabled
                  title="GM chỉ pick cả set"
                  className="opacity-60"
                >
                  Chỉ pick set
                </Button>
              )}
              {!q.hint_index && selSlot && (
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => void reuseFromBank(q)}
                  disabled={adding || added}
                  className="disabled:opacity-50"
                >
                  {adding ? "Đang thêm…" : added ? "Đã thêm" : `Vào ${selSlot}`}
                </Button>
              )}
            </span>
          );
        },
      }),
    ],
    [selSlot, addedCodes, addingId, reuseFromBank],
  );

  return (
    <div className="flex flex-col gap-4">
      <MatchQuestionCreatePanel
        open={showCreate}
        saving={saving}
        onClose={() => setShowCreate(false)}
        onCreate={(value) => void createQuestion(value)}
      />
      <ConfirmActionPanel
        open={deleting !== null}
        title="Gỡ khỏi slot?"
        tone="danger"
        itemCode={`${deleting?.question_code}${deleting?.slot ? ` · ${deleting.slot}` : ""}`}
        message={deleting ? `Gỡ “${deleting.content}” khỏi trận ${matchCode.trim()}? Slot sẽ trống để pick lại.` : ""}
        confirmLabel="Gỡ"
        saving={deleteSaving}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDeleteQuestion}
      />
      <ConfirmActionPanel
        open={pendingGmSet !== null}
        title="Pick cả set GM?"
        itemCode={pendingGmSet?.set_code ?? undefined}
        message={
          pendingGmSet
            ? `Pick 1 KEY + 8 hint vào trận ${matchCode.trim()}?`
            : ""
        }
        note="GM chỉ pick cả set, không pick lẻ."
        confirmLabel="Pick cả set"
        saving={addingId === pendingGmSet?.bank_code}
        onClose={() => setPendingGmSet(null)}
        onConfirm={confirmPickGmSet}
      />

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-accent/50 p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-success">
          Pick từ bank vào trận (theo slot)
        </h3>

        <div className="grid grid-cols-1 gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
          {/* TRÁI — toolbar mã trận + ma trận (cuộn độc lập) */}
          <div className="flex min-w-0 flex-col gap-4 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-2">
            <div className="flex items-center gap-2">
              <InputGroup className="h-9 min-w-0 flex-1">
                <InputGroupInput
                  value={matchCode}
                  onChange={(e) => setMatchCode(e.target.value)}
                  placeholder="Mã trận đấu"
                  className="font-mono text-sm"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    variant="default"
                    onClick={() => void fetchQuestions()}
                    disabled={loading || !matchCode.trim()}
                    className="disabled:opacity-50 text-sm font-medium"
                  >
                    <Search size={14} /> {loading ? "Đang tải…" : "Tải"}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <Button
                variant="default"
                onClick={() => setShowCreate(true)}
                disabled={!matchCode.trim()}
                className="shrink-0 gap-1 disabled:opacity-50 text-sm font-medium"
                title="Soạn câu tay trong sidebar phải"
              >
                <Plus size={14} /> Soạn câu
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded border border-dashed border-border bg-accent/50"
                  aria-hidden
                />
                Trống
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded border border-success bg-success/20"
                  aria-hidden
                />
                Đã có
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded border-2 border-primary bg-primary/30"
                  aria-hidden
                />
                Đang chọn
              </span>
            </div>

            {ROUND_META.map((r) => {
              const prog = roundProgress(r.id);
              const [done, total] = prog.split("/");
              const full = done === total && total !== "0";
              return (
                <div key={r.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {r.label}
                    </p>
                    <span
                      className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${
                        full
                          ? "border-success/40 bg-success/15 text-success"
                          : "border-border bg-accent/60 text-muted-foreground"
                      }`}
                    >
                      {prog}
                    </span>
                  </div>
                  {groupsForRound(r.id).map((grp) => (
                    <div
                      key={grp.label ?? r.id}
                      className="flex flex-col gap-1.5"
                    >
                      {grp.label && (
                        <p className="text-[11px] text-muted-foreground/80">
                          {grp.label}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {grp.slots.map((sl) => {
                          const filled = questions.find(
                            (q) => q.slot === sl,
                          );
                          const active = selSlot === sl;
                          return (
                            <Button
                              key={sl}
                              variant="ghost"
                              onClick={() =>
                                setSelSlot(active ? null : sl)
                              }
                              title={
                                filled
                                  ? `${sl} · ${filled.question_code}`
                                  : sl
                              }
                              className={`h-11 w-12 rounded-lg border font-mono text-xs font-medium ${
                                filled
                                  ? "border-success bg-success/20 text-success hover:bg-success/30"
                                  : active
                                    ? "border-primary bg-primary/30 text-brand ring-2 ring-brand/50"
                                    : "border-dashed border-border bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              {tileLabel(sl)}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {r.id === "KDR" && (
                    <p className="text-[11px] text-muted-foreground">
                      Lượt i = thí sinh vị trí i trong trận (tự map lúc pick).
                    </p>
                  )}
                </div>
              );
            })}

            {/* Chi tiết slot đang chọn */}
            {selSlot &&
              (() => {
                const filled = questions.find((q) => q.slot === selSlot);
                if (!filled) {
                  return (
                    <div className="rounded-lg border border-dashed border-primary/50 bg-primary/10 p-3">
                      <p className="text-xs text-muted-foreground">
                        Slot{" "}
                        <span className="font-mono text-brand">{selSlot}</span>{" "}
                        trống — tìm trong Bank đã duyệt rồi bấm &quot;Vào{" "}
                        {selSlot}&quot;.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-success">
                        {filled.slot} · {filled.question_code}
                      </p>
                      <p className="text-sm text-foreground">{filled.content}</p>
                      <p className="text-xs text-muted-foreground">
                        Đáp án:{" "}
                        <span className="font-semibold text-foreground">
                          {filled.answer}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => setDeleting(filled)}
                      className="shrink-0"
                    >
                      Gỡ khỏi slot
                    </Button>
                  </div>
                );
              })()}
            {/* Câu chưa xếp slot (soạn tay) */}
            {questions.some((q) => !q.slot) && (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chưa xếp ({questions.filter((q) => !q.slot).length})
                </p>
                {questions
                  .filter((q) => !q.slot)
                  .map((q) => (
                    <p key={q.question_code} className="truncate text-sm">
                      <span className="font-mono text-xs text-success">
                        {q.question_code}
                      </span>{" "}
                      <span className="text-foreground">{q.content}</span>
                    </p>
                  ))}
              </div>
            )}
            {bankRound === "GM" && (
              <p className="text-xs text-muted-foreground">
                Chọn dòng KEY ở cột Bank rồi Pick cả set (chặn cứng nếu set thiếu
                1 KEY + 8 hint đã duyệt).
              </p>
            )}
          </div>

          {/* PHẢI — ngân hàng để pick */}
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-background/25 p-4 lg:sticky lg:top-16 lg:self-start xl:max-w-[44rem]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bank đã duyệt{selSlot ? ` · ${selSlot}` : " · tất cả vòng"}
            </p>
            {!selSlot && (
              <p className="text-[11px] text-muted-foreground">
                Chưa chọn ô — bấm 1 ô bên trái để bật nút &quot;Vào
                slot&quot;.
              </p>
            )}
            <InputGroup className="h-9">
              <InputGroupInput
                value={bankQuery}
                onChange={(e) => setBankQuery(e.target.value)}
                placeholder={
                  selSlot
                    ? `Tìm bank cho slot ${selSlot}…`
                    : "Tìm theo mã / nội dung / đáp án…"
                }
                className="text-sm"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  variant="default"
                  onClick={() => void fetchBank(bankQuery)}
                  disabled={bankLoading}
                  className="disabled:opacity-50 text-sm"
                >
                  <Search size={14} /> Tìm
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <DataTable
              columns={bankColumns}
              data={bankQuestions}
              loading={bankLoading}
              pageSize={10}
              emptyText={
                selSlot
                  ? `Chưa có bank khớp ${selSlot} — thử từ khóa khác hoặc chọn slot khác.`
                  : "Chưa có câu bank đã duyệt nào."
              }
            />
            {!bankLoading &&
              bankTotal > bankQuestions.length && (
                <p className="text-[11px] text-muted-foreground">
                  Hiển thị {bankQuestions.length}/{bankTotal} câu — gõ từ khóa
                  hoặc bấm ô slot để lọc.
                </p>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};
