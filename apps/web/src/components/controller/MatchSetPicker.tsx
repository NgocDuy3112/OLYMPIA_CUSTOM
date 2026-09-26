import { useCallback, useEffect, useState } from "react";
import { Layers, Zap } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { ConfirmActionPanel } from "@/components/shared/ui/ConfirmActionPanel";

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

/** Controller chọn bộ đề cho trận: kích hoạt = copy bộ vào câu hỏi trận. */
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
        alert(`Kích hoạt thất bại: ${json?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setActivating(null);
      await fetchSets();
      onChanged();
      alert(json.message ?? "Đã kích hoạt");
    } catch (err) {
      logger.error("Error activating set:", err);
      alert("Lỗi kết nối khi kích hoạt");
    } finally {
      setSaving(false);
    }
  }, [activating, fetchSets, matchCode, onChanged]);

  if (!matchCode) return null;

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2.5">
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
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
        <Layers size={15} className="text-emerald-400" /> Bộ đề trận này
      </h2>
      {loading ? (
        <p className="text-gray-500 text-sm">Đang tải…</p>
      ) : sets.length === 0 ? (
        <p className="text-gray-500 text-sm">
          Chưa có bộ đề nào gán cho {matchCode}. Nhờ QAuthor soạn ở tab Bộ đề.
        </p>
      ) : (
        sets.map((s) => (
          <div
            key={s.setCode}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
              s.activeMatchCode === matchCode
                ? "bg-blue-600/10 border-blue-500/40"
                : "bg-white/[0.02] border-white/10"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {s.setName}{" "}
                <span className="font-mono text-[11px] text-gray-500">{s.setCode}</span>
              </p>
              <p className="text-[11px] text-gray-500 font-mono">
                {s.filled}/{s.expected} câu · {s.status === "ready" ? "Sẵn sàng" : "Nháp"}
                {s.activeMatchCode === matchCode && (
                  <span className="ml-1 text-blue-300">· ĐANG LIVE</span>
                )}
              </p>
            </div>
            {s.status === "ready" && s.activeMatchCode !== matchCode && (
              <button
                onClick={() => setActivating(s)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold whitespace-nowrap"
              >
                <Zap size={13} /> Kích hoạt
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default MatchSetPicker;
