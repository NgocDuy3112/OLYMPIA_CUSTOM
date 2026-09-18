import { useCallback, useEffect, useState } from "react";
import { HelpCircle, Clock, CheckCircle2, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";

const logger = createLogger("QAuthorOverviewPage");

interface OverviewStats {
  questions: number;
  pending: number;
  decided: number;
}

const StatCard = ({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: string;
}) => (
  <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3">
    <div className={`p-2.5 rounded-lg ${accent}`}>{icon}</div>
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  </div>
);

const QAuthorOverviewPage = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [stats, setStats] = useState<OverviewStats>({
    questions: 0,
    pending: 0,
    decided: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    const code = matchCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const [qRes, pRes, dRes] = await Promise.all([
        fetch(
          `${API_BASE_URL}/questions?match_code=${encodeURIComponent(code)}`,
          { credentials: "include" },
        ),
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
    void fetchStats();
  }, [fetchStats]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Tổng quan nội dung</h1>
      <div className="flex gap-2">
        <input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Mã trận đấu"
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
        />
        <button
          onClick={() => void fetchStats()}
          disabled={loading || !matchCode.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> Tải
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<HelpCircle size={20} className="text-green-400" />}
          label="Câu hỏi đã tạo"
          value={stats.questions}
          accent="bg-green-600/20"
        />
        <StatCard
          icon={<Clock size={20} className="text-yellow-400" />}
          label="Review chờ duyệt"
          value={stats.pending}
          accent="bg-yellow-600/20"
        />
        <StatCard
          icon={<CheckCircle2 size={20} className="text-blue-400" />}
          label="Review đã chốt"
          value={stats.decided}
          accent="bg-blue-600/20"
        />
      </div>
      <p className="text-xs text-gray-500">
        Admin theo dõi vận hành (giải đấu, trận, users). QAuthor theo dõi nội
        dung (câu hỏi, duyệt điểm).
      </p>
    </div>
  );
};

export default QAuthorOverviewPage;
