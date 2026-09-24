import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Clock, CheckCircle2, Search, Monitor, Copy, Check, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode, setMatchCode } from "@/utils/storage";
import { OVERLAYS, overlayUrl } from "@/pages/overlay/overlayList";

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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyOverlayUrl = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // clipboard không khả dụng (OBS cũ) — user copy tay từ text
    }
  };

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
    navigate(`/operator/controller/waiting/${code}`);
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

      {matchCode.trim() && (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
              <Monitor size={15} className="text-blue-400" /> Overlay lên sóng
            </h2>
            <button
              onClick={() =>
                window.open(
                  `${window.location.origin}/overlay/${encodeURIComponent(matchCode.trim())}`,
                  "_blank",
                )
              }
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              Trang preview <ExternalLink size={12} />
            </button>
          </div>
          <p className="text-[11px] text-gray-500">
            Nhập mã trận ở trên là ra URL — paste vào OBS làm Browser Source, không cần gõ tay.
          </p>
          <div className="flex flex-col gap-1.5">
            {OVERLAYS.map((o) => {
              const url = overlayUrl(matchCode.trim(), o.path);
              const copied = copiedId === o.id;
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/30 border border-white/10"
                >
                  <span className="w-24 shrink-0 text-xs font-medium text-gray-300 truncate" title={o.description}>
                    {o.name}
                  </span>
                  <code className="flex-1 min-w-0 truncate text-[11px] font-mono text-gray-500">
                    {url}
                  </code>
                  <button
                    onClick={() => void copyOverlayUrl(o.id, url)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs transition-colors"
                    title="Copy URL cho OBS"
                  >
                    {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                    {copied ? "Đã copy" : "Copy"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ControllerOverviewPage;
