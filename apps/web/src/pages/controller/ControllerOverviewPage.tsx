import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Clock, CheckCircle2, Search } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode, setMatchCode } from "@/utils/storage";

const logger = createLogger("ControllerOverviewPage");

interface OverviewStats {
  players: number;
  pending: number;
  questions: number;
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

const ControllerOverviewPage = () => {
  const navigate = useNavigate();
  const [matchCode, setCode] = useState(getMatchCode());
  const [stats, setStats] = useState<OverviewStats>({
    players: 0,
    pending: 0,
    questions: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    const code = matchCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const [sbRes, pRes, qRes] = await Promise.all([
        fetch(`${API_BASE_URL}/scoreboard/${encodeURIComponent(code)}`, {
          credentials: "include",
        }),
        fetch(
          `${API_BASE_URL}/score-reviews?match_code=${encodeURIComponent(code)}&status=pending`,
          { credentials: "include" },
        ),
        fetch(
          `${API_BASE_URL}/questions?match_code=${encodeURIComponent(code)}`,
          { credentials: "include" },
        ),
      ]);
      const sbJson = await sbRes.json().catch(() => null);
      const pJson = await pRes.json().catch(() => null);
      const qJson = await qRes.json().catch(() => null);
      const board = sbJson?.data?.scoreboard ?? sbJson?.data ?? [];
      setStats({
        players: Array.isArray(board) ? board.length : 0,
        pending: Array.isArray(pJson?.data) ? pJson.data.length : 0,
        questions: Array.isArray(qJson?.data) ? qJson.data.length : 0,
      });
    } catch (err) {
      logger.error("Error fetching controller overview:", err);
    } finally {
      setLoading(false);
    }
  }, [matchCode]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const enterLive = () => {
    const code = matchCode.trim();
    if (!code) return;
    setMatchCode(code);
    navigate(`/controller/waiting/${code}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Tổng quan live</h1>
      <div className="flex gap-2">
        <input
          value={matchCode}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Mã trận đấu"
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
        />
        <button
          onClick={() => void fetchStats()}
          disabled={loading || !matchCode.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-sm text-white"
        >
          <Search size={14} /> Tải
        </button>
        <button
          onClick={enterLive}
          disabled={!matchCode.trim()}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-sm font-semibold text-white"
        >
          <Play size={14} /> Vào live
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Play size={20} className="text-orange-400" />}
          label="Thí sinh trong trận"
          value={stats.players}
          accent="bg-orange-600/20"
        />
        <StatCard
          icon={<Clock size={20} className="text-yellow-400" />}
          label="Review chờ duyệt"
          value={stats.pending}
          accent="bg-yellow-600/20"
        />
        <StatCard
          icon={<CheckCircle2 size={20} className="text-blue-400" />}
          label="Câu hỏi trận này"
          value={stats.questions}
          accent="bg-blue-600/20"
        />
      </div>
      <p className="text-xs text-gray-500">
        Controller điều hành live. CRUD hệ thống nằm ở Admin. Soạn câu hỏi nằm
        ở QAuthor.
      </p>
    </div>
  );
};

export default ControllerOverviewPage;
