import { useCallback, useEffect, useState } from "react";
import { HelpCircle, Clock, CheckCircle2 } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const logger = createLogger("OverviewStats");

export const OverviewStats = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [stats, setStats] = useState({ questions: 0, pending: 0, decided: 0 });
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    const code = matchCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const [qRes, pRes, dRes] = await Promise.all([
        fetch(`${API_BASE_URL}/questions?match_code=${encodeURIComponent(code)}`, {
          credentials: "include",
        }),
        fetch(
          `${API_BASE_URL}/score-reviews?match_code=${encodeURIComponent(code)}&status=pending`,
          { credentials: "include" },
        ),
        fetch(
          `${API_BASE_URL}/score-reviews?match_code=${encodeURIComponent(code)}&status=decided`,
          { credentials: "include" },
        ),
      ]);
      const qJson = await qRes.json().catch(() => null);
      const pJson = await pRes.json().catch(() => null);
      const dJson = await dRes.json().catch(() => null);
      setStats({
        questions: Array.isArray(qJson?.data) ? qJson.data.length : 0,
        pending: Array.isArray(pJson?.data) ? pJson.data.length : 0,
        decided: Array.isArray(dJson?.data) ? dJson.data.length : 0,
      });
    } catch (err) {
      logger.error("Error fetching overview:", err);
    } finally {
      setLoading(false);
    }
  }, [matchCode]);

  useEffect(() => {
    if (matchCode.trim()) void fetchStats();
  }, []);

  return (
    <div className="bg-accent/50 border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Mã trận để xem tổng quan"
          className="flex-1 px-3 py-1.5 rounded-lg bg-background/60 border border-border text-foreground font-mono text-xs"
        />
        <Button
          variant="default"
          onClick={() => void fetchStats()}
          disabled={loading || !matchCode.trim()}
          className="bg-success hover:bg-success/90 disabled:opacity-50 text-xs text-success-foreground"
        >
          {loading ? "…" : "Tải"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-success/10 border border-success/20 p-2.5 flex items-center gap-2">
          <HelpCircle size={16} className="text-success shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground leading-none">{stats.questions}</p>
            <p className="text-[11px] text-muted-foreground">Câu hỏi</p>
          </div>
        </div>
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-2.5 flex items-center gap-2">
          <Clock size={16} className="text-warning shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground leading-none">{stats.pending}</p>
            <p className="text-[11px] text-muted-foreground">Chờ duyệt</p>
          </div>
        </div>
        <div className="rounded-lg bg-primary/10 border border-primary/20 p-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-brand shrink-0" />
          <div>
            <p className="text-lg font-bold text-foreground leading-none">{stats.decided}</p>
            <p className="text-[11px] text-muted-foreground">Đã chốt</p>
          </div>
        </div>
      </div>
    </div>
  );
};
