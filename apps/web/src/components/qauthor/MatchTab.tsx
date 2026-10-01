import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { normalizeQuestionRow } from "@/utils/questionMapper";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { MatchQuestionCreatePanel, type MatchQuestionCreateValue } from "./MatchQuestionCreatePanel";
import { BANK_PAGE_SIZE, toBankData, type BankData } from "./bankTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const logger = createLogger("MatchTab");

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
  const [pickRound, setPickRound] = useState<PickRound>("KDC");
  const [selSlot, setSelSlot] = useState<string | null>(null);
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

  const fetchBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const params = new URLSearchParams();
      if (bankQuery.trim()) params.set("q", bankQuery.trim());
      params.set("round_hint", ROUND_OF_SLOT[pickRound]);
      // VĐ slot đang chọn thì lọc đúng ô matrix.
      if (pickRound === "VD" && selSlot) {
        const m = /^VD_([A-Z]+)_(\d+)$/.exec(selSlot);
        if (m) {
          params.set("domain", m[1]);
          params.set("difficulty", m[2]);
        }
      }
      params.set("status", "approved");
      params.set("limit", String(BANK_PAGE_SIZE));
      params.set("page", "1");
      const res = await fetch(
        `${API_BASE_URL}/bank/search?${params.toString()}`,
        { credentials: "include" },
      );
      const json = await res.json();
      const data = json.data as { rows: Record<string, unknown>[] } | null;
      if (json.status === "success" && data) {
        setBankQuestions((data.rows as Record<string, unknown>[]).map(toBankData));
      } else {
        setBankQuestions([]);
      }
    } catch (err) {
      logger.error("Error fetching bank:", err);
      setBankQuestions([]);
    } finally {
      setBankLoading(false);
    }
  }, [bankQuery, pickRound, selSlot]);

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
    const round = ROUND_OF_SLOT[pickRound];
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
  }, [fetchQuestions, matchCode, pickRound, selSlot]);

  const confirmPickGmSet = useCallback(async () => {
    const code = matchCode.trim();
    if (!code || !pendingGmSet?.set_code) return;
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

  const ROUND_TABS: { id: PickRound; label: string }[] = [
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

      <div className="bg-accent/50 border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            placeholder="Mã trận đấu"
            className="flex-1 h-9 text-foreground font-mono text-sm"
          />
          <Button
            variant="default"
            onClick={() => void fetchQuestions()}
            disabled={loading || !matchCode.trim()}
            className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm text-success-foreground font-medium"
          >
            <Search size={14} /> {loading ? "Đang tải…" : "Tải"}
          </Button>
          <Button
            variant="default"
            onClick={() => setShowCreate(true)}
            disabled={!matchCode.trim()}
            className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm text-success-foreground font-medium"
            title="Soạn câu tay trong sidebar phải"
          >
            <Plus size={14} /> Soạn câu
          </Button>
        </div>
      </div>

      <div className="bg-accent/50 border border-border rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-success uppercase tracking-wide">
          Pick từ bank vào trận (theo slot)
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {ROUND_TABS.map((t) => {
            const prog = roundProgress(t.id);
            const [done, total] = prog.split("/");
            return (
              <Button
                key={t.id}
                variant="ghost"
                onClick={() => { setPickRound(t.id); setSelSlot(null); }}
                className={`px-3 py-1.5 text-xs font-medium ${
                  pickRound === t.id ? "bg-success/20 text-success" : "text-muted-foreground hover:text-foreground bg-accent/50"
                }`}
              >
                {t.label} <span className={`font-mono ${done === total && total !== "0" ? "text-success" : "opacity-70"}`}>{prog}</span>
              </Button>
            );
          })}
        </div>
        {pickRound === "KDR" && (
          <p className="text-xs text-muted-foreground">Lượt i = thí sinh vị trí i trong trận (tự map lúc pick).</p>
        )}
        {(pickRound === "KDR" || pickRound === "VD" ? (
          pickRound === "KDR"
            ? [1, 2, 3, 4].map((t) => ({ label: `Lượt ${t}`, slots: slotsFor(pickRound).filter((s) => s.startsWith(`KDR${t}_`)) }))
            : ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"].map((d) => ({ label: d, slots: slotsFor(pickRound).filter((s) => s.startsWith(`VD_${d}_`)) }))
        ) : (
          [{ label: "", slots: slotsFor(pickRound) }]
        )).map((grp) => (
          <div key={grp.label || "all"} className="flex flex-col gap-1.5">
            {grp.label && <p className="text-xs font-semibold text-muted-foreground">{grp.label}</p>}
            <div className="flex flex-wrap gap-1.5">
              {grp.slots.map((s) => {
            const filled = questions.find((q) => q.slot === s);
            const active = selSlot === s;
            const short = s.startsWith("KDR")
              ? `L${s[3]}·${s.slice(5)}`
              : s.replace(/^(KDC_|GM_|BP_|VD_)/, "");
            return (
              <Button
                key={s}
                variant="ghost"
                onClick={() => setSelSlot(active ? null : s)}
                title={filled ? filled.question_code : s}
                className={`font-mono text-xs border ${
                  filled
                    ? "bg-success/20 border-success text-success"
                    : active
                      ? "bg-primary/30 border-primary text-brand"
                      : "bg-accent/50 border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                {short}
              </Button>
            );
          })}
            </div>
          </div>
        ))}
        {/* Chi tiết slot đang chọn — thay cho box "Danh sách" cũ */}
        {selSlot &&
          (() => {
            const filled = questions.find((q) => q.slot === selSlot);
            if (!filled) {
              return (
                <p className="text-xs text-muted-foreground">
                  Slot <span className="font-mono text-brand">{selSlot}</span> trống — tìm bank
                  bên dưới rồi bấm &quot;Vào {selSlot}&quot;.
                </p>
              );
            }
            return (
              <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-success">
                    {filled.slot} · {filled.question_code}
                  </p>
                  <p className="text-sm text-foreground">{filled.content}</p>
                  <p className="text-xs text-muted-foreground">
                    Đáp án:{" "}
                    <span className="font-semibold text-foreground">{filled.answer}</span>
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
        {/* Câu chưa xếp slot (soạn tay) — chỉ hiển thị, không sửa/xoá ở tab này */}
        {questions.some((q) => !q.slot) && (
          <div className="rounded-lg border border-border bg-background/40 p-3 flex flex-col gap-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Chưa xếp ({questions.filter((q) => !q.slot).length})
            </p>
            {questions
              .filter((q) => !q.slot)
              .map((q) => (
                <p key={q.question_code} className="text-sm truncate">
                  <span className="font-mono text-xs text-success">{q.question_code}</span>{" "}
                  <span className="text-foreground">{q.content}</span>
                </p>
              ))}
          </div>
        )}
        {pickRound === "GM" && (
          <p className="text-xs text-muted-foreground">
            Chọn dòng KEY bên dưới rồi Pick cả set (chặn cứng nếu set thiếu 1 KEY + 8 hint đã duyệt).
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={bankQuery}
            onChange={(e) => setBankQuery(e.target.value)}
            placeholder={selSlot ? `Tìm bank cho slot ${selSlot}…` : "Chọn slot trước, rồi tìm bank…"}
            className="flex-1 h-9 text-foreground text-sm"
          />
          <Button
            variant="default"
            onClick={() => void fetchBank()}
            disabled={bankLoading}
            className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm text-success-foreground"
          >
            <Search size={14} /> Tìm
          </Button>
        </div>
        {bankLoading ? (
          <p className="text-muted-foreground text-sm">Đang tải bank đã duyệt…</p>
        ) : bankQuestions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {selSlot
              ? `Chưa có bank khớp ${selSlot} — thử từ khóa khác hoặc chọn slot khác.`
              : "Chọn 1 slot trống rồi bấm Tìm để xem bank đã duyệt."}
          </p>
        ) : null}
        {bankQuestions.map((q) => {
          const added = addedCodes.has(q.bank_code);
          const adding = addingId === q.bank_code;
          return (
            <div key={q.bank_id} className="flex items-center gap-2 text-sm">
              <p className="flex-1 truncate">
                <span className="font-mono text-xs text-success">{q.bank_code}</span>{" "}
                <span className="text-foreground">{q.content}</span>
                {q.hint_index && <span className="ml-1 font-mono text-xs text-warning">· {q.hint_index}</span>}
                {q.domain && <span className="ml-1 font-mono text-xs text-brand">· {q.domain}{q.difficulty ? `_${q.difficulty}` : ""}</span>}
              </p>
              {pickRound === "GM" && q.hint_index === "KEY" && (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setPendingGmSet(q)}
                  disabled={adding}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                >
                  {adding ? "…" : "Pick cả set"}
                </Button>
              )}
              <Button
                size="xs"
                variant="secondary"
                onClick={() => void reuseFromBank(q)}
                disabled={adding || added || !selSlot || pickRound === "GM"}
                title={pickRound === "GM" ? "GM chỉ pick cả set" : undefined}
                className="bg-success hover:bg-success/90 text-success-foreground disabled:opacity-50"
              >
                {adding ? "Đang thêm…" : added ? "Đã thêm" : pickRound === "GM" ? "Chỉ pick set" : selSlot ? `Vào ${selSlot}` : "Chọn slot"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
