import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Clock, CheckCircle2, Search, Monitor, Copy, Check, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode, setMatchCode } from "@/utils/storage";
import { OVERLAYS, overlayUrl } from "@/pages/overlay/overlayList";
import { ENABLE_OVERLAY } from "@/configs";
import { MatchSetPicker } from "@/components/controller/MatchSetPicker";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

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
  <div className="rounded-xl bg-accent/50 border border-border p-4 flex items-center gap-3">
    <div className={`p-2.5 rounded-lg ${accent}`}>{icon}</div>
    <div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
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
      <div className="flex gap-2">
        <InputGroup className="h-9 flex-1">
          <InputGroupInput
            value={matchCode}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Mã trận đấu"
            className="font-mono text-sm"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
                variant="default"
              onClick={() => void fetchStats()}
              disabled={loading || !matchCode.trim()}
              className="disabled:opacity-50 text-sm"
            >
              <Search size={14} /> Tải
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <Button
          variant="default"
          onClick={enterLive}
          disabled={!matchCode.trim()}
          className="gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-sm font-semibold text-success-foreground"
        >
          <Play size={14} /> Vào live
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Play size={20} className="text-role-controller" />}
          label="Thí sinh trong trận"
          value={stats.players}
          accent="bg-role-controller/20"
        />
        <StatCard
          icon={<Clock size={20} className="text-warning" />}
          label="Review chờ duyệt"
          value={stats.pending}
          accent="bg-warning/20"
        />
        <StatCard
          icon={<CheckCircle2 size={20} className="text-brand" />}
          label="Câu hỏi trận này"
          value={stats.questions}
          accent="bg-primary/20"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Controller điều hành live. CRUD hệ thống nằm ở Admin. Soạn câu hỏi nằm
        ở QAuthor.
      </p>
      {matchCode.trim() && (
        <MatchSetPicker matchCode={matchCode.trim().toUpperCase()} onChanged={fetchStats} />
      )}

      {ENABLE_OVERLAY && matchCode.trim() && (
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <Monitor size={15} className="text-brand" /> Overlay lên sóng
            </h2>
            <Button
              variant="ghost"
              onClick={() =>
                window.open(
                  `${window.location.origin}/overlay/${encodeURIComponent(matchCode.trim())}`,
                  "_blank",
                )
              }
              className="gap-1 px-0 text-xs text-brand hover:text-brand"
            >
              Trang preview <ExternalLink size={12} />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Nhập mã trận ở trên là ra URL — paste vào OBS làm Browser Source, không cần gõ tay.
          </p>
          <div className="flex flex-col gap-1.5">
            {OVERLAYS.map((o) => {
              const url = overlayUrl(matchCode.trim(), o.path);
              const copied = copiedId === o.id;
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-background/60 border border-border"
                >
                  <span className="w-24 shrink-0 text-xs font-medium text-foreground/80 truncate" title={o.description}>
                    {o.name}
                  </span>
                  <code className="flex-1 min-w-0 truncate text-[11px] font-mono text-muted-foreground">
                    {url}
                  </code>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => void copyOverlayUrl(o.id, url)}
                    className="shrink-0 gap-1 bg-accent hover:bg-accent/80 text-xs"
                    title="Copy URL cho OBS"
                  >
                    {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                    {copied ? "Đã copy" : "Copy"}
                  </Button>
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
