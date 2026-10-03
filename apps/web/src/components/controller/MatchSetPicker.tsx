import { useCallback, useEffect, useState } from "react";
import { Layers, Zap } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";

const logger = createLogger("MatchSetPicker");

interface SetRow {
  setCode: string;
  setName: string;
  matchCode: string | null;
  status: string;
  activeMatchCode: string | null;
  filled: number;
  expected: number;
}

interface MatchSetPickerProps {
  matchCode: string;
  onChanged: () => void;
}

export function MatchSetPicker({ matchCode, onChanged }: MatchSetPickerProps) {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<SetRow | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchSets = useCallback(async () => {
    if (!matchCode) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/question-sets?matchCode=${encodeURIComponent(matchCode)}`,
        { credentials: "include" },
      );
      const json = await res.json();
      setSets(json.status === "success" && Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      logger.error("Error fetching sets:", err);
      setSets([]);
    } finally {
      setLoading(false);
    }
  }, [matchCode]);

  useEffect(() => {
    void fetchSets();
  }, [fetchSets]);

  const confirmActivate = useCallback(async () => {
    if (!activating) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/question-sets/${encodeURIComponent(activating.setCode)}/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ matchCode }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.status !== "success") {
        notifyError(`Kích hoạt thất bại: ${json?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setActivating(null);
      await fetchSets();
      onChanged();
      notifySuccess(json.message ?? "Đã kích hoạt");
    } catch (err) {
      logger.error("Error activating set:", err);
      notifyError("Lỗi kết nối khi kích hoạt");
    } finally {
      setSaving(false);
    }
  }, [activating, fetchSets, matchCode, onChanged]);

  if (!matchCode) return null;

  return (
    <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2.5">
      <ConfirmActionPanel
        open={activating !== null}
        title="Kích hoạt bộ đề?"
        tone="danger"
        itemCode={activating?.setCode}
        message={`Copy ${activating?.filled ?? 0} câu của “${activating?.setName}” vào trận ${matchCode}, GHI ĐÈ toàn bộ câu hỏi hiện tại.`}
        confirmLabel="Kích hoạt"
        saving={saving}
        onClose={() => setActivating(null)}
        onConfirm={confirmActivate}
      />
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Layers size={15} className="text-success" /> Bộ đề trận này
      </h2>
      {loading ? (
        <p className="text-muted-foreground text-sm">Đang tải…</p>
      ) : sets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Chưa có bộ đề nào gán cho {matchCode}. Nhờ QAuthor soạn ở tab Bộ đề.
        </p>
      ) : (
        sets.map((s) => (
          <div
            key={s.setCode}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
              s.activeMatchCode === matchCode
                ? "bg-primary/10 border-primary/40"
                : "bg-accent/25 border-border"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                {s.setName}{" "}
                <span className="font-mono text-[11px] text-muted-foreground">{s.setCode}</span>
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {s.filled}/{s.expected} câu · {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                {s.activeMatchCode === matchCode && (
                  <span className="ml-1 text-brand">· ĐANG LIVE</span>
                )}
              </p>
            </div>
            {s.status === "ready" && s.activeMatchCode !== matchCode && (
              <Button
                size="xs"
                variant="default"
                onClick={() => setActivating(s)}
                className="gap-1 text-xs font-semibold whitespace-nowrap"
              >
                <Zap size={13} /> Kích hoạt
              </Button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default MatchSetPicker;
