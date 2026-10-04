import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ClipboardCheck,
  Gamepad2,
  RefreshCw,
  ScrollText,
  Trophy,
  Users,
} from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";

const logger = createLogger("AdminDashboardPage");

interface Tournament {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface MatchRow {
  id: string;
  matchSlug: string;
  matchCode: string;
  matchName: string;
  matchStatus: string;
  tournamentId?: string | null;
  scheduledAt?: string | null;
  createdAt?: string;
}

interface UserRow {
  userCode: string;
  role: string;
  operatorScopes?: string | null;
  createdAt?: string;
}

interface AuditLog {
  id: string;
  actionType: string;
  actorCode?: string | null;
  matchCode?: string | null;
  createdAt?: string;
}

interface BankRoundStat {
  group: string;
  rounds: string;
  approved: number;
  pending: number;
}

interface DayBucket {
  key: string;
  label: string;
  total: number;
  logins: number;
}

interface DashboardState {
  tournaments: Tournament[];
  matches: MatchRow[];
  users: UserRow[];
  pendingBank: number;
  approvedBank: number;
  rejectedBank: number;
  bankByRound: BankRoundStat[];
  recentLogs: AuditLog[];
  totalLogs: number;
  actionCounts: { action: string; count: number }[];
  trend: DayBucket[];
  apiOk: boolean | null;
  agentOk: boolean | null;
  apiMs: number | null;
  agentMs: number | null;
  checkedAt: string | null;
}

const BANK_ROUNDS: { group: string; rounds: string }[] = [
  { group: "Khởi động", rounds: "KD_C,KD_R" },
  { group: "GM", rounds: "GM" },
  { group: "Bứt phá", rounds: "BP" },
  { group: "Về đích", rounds: "VD" },
];

const initialState: DashboardState = {
  tournaments: [],
  matches: [],
  users: [],
  pendingBank: 0,
  approvedBank: 0,
  rejectedBank: 0,
  bankByRound: [],
  recentLogs: [],
  totalLogs: 0,
  actionCounts: [],
  trend: [],
  apiOk: null,
  agentOk: null,
  apiMs: null,
  agentMs: null,
  checkedAt: null,
};

const StatCard = ({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
}) => (
  <Button
    variant="ghost"
    onClick={onClick}
    className="h-auto flex-col items-start gap-1 rounded-xl bg-accent/50 border border-border p-4 hover:bg-accent"
  >
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide">
      {icon}
      {label}
    </div>
    <p className="text-2xl font-bold text-foreground">{value}</p>
    {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
  </Button>
);

const BarRow = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-32 shrink-0 text-[11px] text-muted-foreground truncate" title={label}>{label}</span>
    <div className="flex-1 h-2 rounded-full bg-accent overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} />
    </div>
    <span className="w-8 text-right text-[11px]  text-foreground/80">{value}</span>
  </div>
);
const QuickAction = ({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
}) => (
  <Button
    variant="ghost"
    onClick={onClick}
    className="h-auto items-center gap-3 rounded-xl bg-accent/50 border border-border p-3 hover:bg-accent hover:border-primary/50 text-left"
  >
    <span className="p-2 rounded-lg bg-primary/20 text-brand">{icon}</span>
    <span>
      <span className="block text-sm font-semibold text-foreground">{label}</span>
      <span className="block text-xs text-muted-foreground">{desc}</span>
    </span>
  </Button>
);

const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const roundReqs = BANK_ROUNDS.flatMap((g) => [
        fetch(`${API_BASE_URL}/bank/search?round_hints=${encodeURIComponent(g.rounds)}&status=approved&limit=1&page=1`, {
          credentials: "include",
        }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/bank/search?round_hints=${encodeURIComponent(g.rounds)}&status=pending&limit=1&page=1`, {
          credentials: "include",
        }).then((r) => r.json()),
      ]);
      const [tRes, mRes, uRes, bPen, bApp, bRej, aRes, ...roundRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/tournaments`, { credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/matches`, { credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/users`, { credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/bank/search?status=pending&limit=1&page=1`, {
          credentials: "include",
        }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/bank/search?status=approved&limit=1&page=1`, {
          credentials: "include",
        }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/bank/search?status=rejected&limit=1&page=1`, {
          credentials: "include",
        }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/audit-logs?limit=100`, { credentials: "include" }).then((r) =>
          r.json(),
        ),
        ...roundReqs,
      ]);

      const tournaments: Tournament[] =
        tRes.status === "fulfilled" && tRes.value?.status === "success" && Array.isArray(tRes.value.data)
          ? tRes.value.data
          : [];
      const matches: MatchRow[] =
        mRes.status === "fulfilled" && mRes.value?.status === "success" && Array.isArray(mRes.value.data)
          ? mRes.value.data
          : [];
      const users: UserRow[] =
        uRes.status === "fulfilled" && uRes.value?.status === "success" && Array.isArray(uRes.value.data)
          ? uRes.value.data
          : [];
      const bankTotal = (r: unknown) =>
        typeof r === "object" && r !== null && (r as { status?: string }).status === "success"
          ? Number((r as { data?: { total?: number } }).data?.total ?? 0)
          : 0;
      const pendingBank = bPen.status === "fulfilled" ? bankTotal(bPen.value) : 0;
      const approvedBank = bApp.status === "fulfilled" ? bankTotal(bApp.value) : 0;
      const rejectedBank = bRej.status === "fulfilled" ? bankTotal(bRej.value) : 0;
      const settledTotal = (r: PromiseSettledResult<unknown> | undefined) =>
        r && r.status === "fulfilled" ? bankTotal(r.value) : 0;
      const bankByRound: BankRoundStat[] = BANK_ROUNDS.map((g, i) => ({
        group: g.group,
        rounds: g.rounds,
        approved: settledTotal(roundRes[i * 2]),
        pending: settledTotal(roundRes[i * 2 + 1]),
      }));
      const allLogs: AuditLog[] =
        aRes.status === "fulfilled" && aRes.value?.status === "success"
          ? (aRes.value?.data?.logs ?? [])
          : [];
      const recentLogs = allLogs.slice(0, 8);
      const totalLogs =
        aRes.status === "fulfilled" && aRes.value?.status === "success"
          ? Number(aRes.value?.data?.total ?? allLogs.length)
          : 0;
      const actionMap = new Map<string, number>();
      allLogs.forEach((l) => actionMap.set(l.actionType, (actionMap.get(l.actionType) ?? 0) + 1));
      const actionCounts = [...actionMap.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      const trend: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        return {
          key,
          label: i === 6 ? "Hôm nay" : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }),
          total: 0,
          logins: 0,
        };
      });
      const trendByKey = new Map(trend.map((b) => [b.key, b]));
      allLogs.forEach((l) => {
        if (!l.createdAt) return;
        const d = new Date(l.createdAt);
        if (Number.isNaN(d.getTime())) return;
        const b = trendByKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        if (!b) return;
        b.total += 1;
        if (l.actionType === "LOGIN") b.logins += 1;
      });

      let apiOk: boolean | null = null;
      let agentOk: boolean | null = null;
      let apiMs: number | null = null;
      let agentMs: number | null = null;
      try {
        const base = API_BASE_URL.replace(/\/api$/, "");
        const timed = async (url: string) => {
          const t0 = performance.now();
          try {
            const r = await fetch(url, { credentials: "include" }).then((r) => r.json());
            return { ms: Math.round(performance.now() - t0), body: r as unknown };
          } catch {
            return { ms: null as number | null, body: null as unknown };
          }
        };
        const [apiH, agentH] = await Promise.all([
          timed(`${base}/health`),
          timed(`${API_BASE_URL}/agent/health`),
        ]);
        apiMs = apiH.ms;
        agentMs = agentH.ms;
        apiOk = (apiH.body as { status?: string } | null)?.status === "healthy";
        const agentStatus = (agentH.body as { status?: string } | null)?.status;
        agentOk = agentStatus === "ok" || agentStatus === "healthy";
      } catch {
      }

      setState({ tournaments, matches, users, pendingBank, approvedBank, rejectedBank, bankByRound, recentLogs, totalLogs, actionCounts, trend, apiOk, agentOk, apiMs, agentMs, checkedAt: new Date().toLocaleTimeString("vi-VN") });
    } catch (err) {
      logger.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const t = setInterval(() => void fetchAll(true), 60000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const activeTournaments = state.tournaments.filter((t) => t.status === "active").length;
  const liveMatches = state.matches.filter((m) => m.matchStatus !== "finished" && m.matchStatus !== "completed").length;
  const finishedMatches = state.matches.length - liveMatches;
  const roleCount = (role: string) => state.users.filter((u) => u.role === role).length;
  const scopeCount = (scope: string) =>
    state.users.filter(
      (u) =>
        u.role === "operator" &&
        (u.operatorScopes ?? "").split(",").map((s) => s.trim()).includes(scope),
    ).length;
  const recentMatches = state.matches.slice(0, 5);
  const recentTournaments = state.tournaments.slice(0, 4);

  const statusCount = (s: string) => state.matches.filter((m) => m.matchStatus === s).length;
  const matchBars = [
    { label: "setup", value: statusCount("setup") },
    { label: "active", value: statusCount("active") + statusCount("in_progress") },
    { label: "paused", value: statusCount("paused") },
    { label: "finished", value: statusCount("finished") + statusCount("completed") },
  ];
  const maxMatch = Math.max(1, ...matchBars.map((b) => b.value));
  const roleBars = [
    { label: "admin", value: roleCount("admin") },
    { label: "operator/controller", value: scopeCount("controller") },
    { label: "operator/qauthor", value: scopeCount("qauthor") },
    { label: "operator/mc", value: scopeCount("mc") },
    { label: "player", value: roleCount("player") },
    { label: "spectator", value: roleCount("spectator") },
  ];
  const maxRole = Math.max(1, ...roleBars.map((b) => b.value));
  const maxAction = Math.max(1, ...state.actionCounts.map((a) => a.count));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newUsers7d = state.users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= weekAgo).length;

  const tNameById = new Map(state.tournaments.map((t) => [t.id, t.tournamentName]));
  const mtCount = new Map<string, number>();
  state.matches.forEach((m) => {
    const key = (m.tournamentId && tNameById.get(m.tournamentId)) || "Chưa gán giải";
    mtCount.set(key, (mtCount.get(key) ?? 0) + 1);
  });
  const matchTournBars = [...mtCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const maxMtTourn = Math.max(1, ...matchTournBars.map((b) => b.value));

  const maxRoundApproved = Math.max(1, ...state.bankByRound.map((b) => b.approved));
  const maxTrend = Math.max(1, ...state.trend.map((b) => b.total));

  const healthDesc = `API ${state.apiOk === null ? "—" : state.apiOk ? `OK${state.apiMs !== null ? ` · ${state.apiMs}ms` : ""}` : "LỖI"} · Agent ${state.agentOk === null ? "—" : state.agentOk ? `OK${state.agentMs !== null ? ` · ${state.agentMs}ms` : ""}` : "LỖI"}${state.checkedAt ? ` · ${state.checkedAt}` : ""}`;

  const needsAttention: { label: string; path: string }[] = [];
  if (state.pendingBank > 0)
    needsAttention.push({ label: `${state.pendingBank} câu bank chờ duyệt`, path: "/admin/bank-review" });
  if (liveMatches > 0)
    needsAttention.push({ label: `${liveMatches} trận chưa hoàn thành`, path: "/admin/game-managing" });
  if (state.apiOk === false || state.agentOk === false)
    needsAttention.push({ label: "Có service lỗi — xem Sức khỏe", path: "/admin/health" });

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => void fetchAll()}
          disabled={loading}
          className="gap-1.5 bg-accent/50 border border-border hover:bg-accent disabled:opacity-50 text-sm"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Đang tải…" : "Làm mới"}
        </Button>
      </div>

      {}
      {needsAttention.length > 0 && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 p-4">
          <p className="text-sm font-semibold text-warning mb-2">Cần xử lý</p>
          <div className="flex flex-wrap gap-2">
            {needsAttention.map((n) => (
              <Button
                key={n.label}
                variant="secondary"
                onClick={() => navigate(n.path)}
                className="bg-warning/20 border border-warning/40 text-warning text-sm hover:bg-warning/30"
              >
                {n.label} →
              </Button>
            ))}
          </div>
        </div>
      )}

      {}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Trophy size={14} />}
          label="Giải đấu"
          value={state.tournaments.length}
          sub={`${activeTournaments} đang diễn ra`}
          onClick={() => navigate("/admin/tournaments")}
        />
        <StatCard
          icon={<Gamepad2 size={14} />}
          label="Trận đấu"
          value={state.matches.length}
          sub={`${liveMatches} live · ${finishedMatches} xong`}
          onClick={() => navigate("/admin/game-managing")}
        />
        <StatCard
          icon={<Users size={14} />}
          label="Người dùng"
          value={state.users.length}
          sub={`${roleCount("player")} thí sinh · ${roleCount("admin")} admin · C${scopeCount("controller")}/Q${scopeCount("qauthor")}/M${scopeCount("mc")} · +${newUsers7d}/7 ngày`}
          onClick={() => navigate("/admin/users")}
        />
        <StatCard
          icon={<ClipboardCheck size={14} />}
          label="Bank chờ duyệt"
          value={state.pendingBank}
          sub="Bấm để duyệt"
          onClick={() => navigate("/admin/bank-review")}
        />
      </div>

      {}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">Trận theo trạng thái</p>
          {matchBars.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.value} max={maxMatch} color="bg-primary" />
          ))}
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">User theo vai trò</p>
          {roleBars.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.value} max={maxRole} color="bg-success" />
          ))}
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">Bank theo vòng (đã duyệt)</p>
          {state.bankByRound.map((b) => (
            <BarRow
              key={b.group}
              label={`${b.group} · chờ ${b.pending}`}
              value={b.approved}
              max={maxRoundApproved}
              color="bg-warning"
            />
          ))}
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">Audit theo hành động (100 mới nhất)</p>
          {state.actionCounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có log.</p>
          ) : (
            state.actionCounts.map((a) => (
              <BarRow key={a.action} label={a.action} value={a.count} max={maxAction} color="bg-purple" />
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">Trận theo giải</p>
          {matchTournBars.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có trận nào.</p>
          ) : (
            matchTournBars.map((b) => (
              <BarRow key={b.label} label={b.label} value={b.value} max={maxMtTourn} color="bg-primary" />
            ))
          )}
        </div>
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80">Hoạt động 7 ngày qua</p>
          <div className="flex items-end gap-1.5 h-20">
            {state.trend.map((b) => (
              <div key={b.key} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${b.label}: ${b.total} hoạt động · ${b.logins} login`}>
                <span className="text-[10px] text-foreground/80">{b.total > 0 ? b.total : ""}</span>
                <div
                  className="w-full rounded bg-primary/70"
                  style={{ height: `${maxTrend > 0 ? Math.max(b.total > 0 ? 8 : 2, Math.round((b.total / maxTrend) * 100)) : 2}%` }}
                />
                <span className="text-[10px] text-muted-foreground">{b.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {state.trend.reduce((s, b) => s + b.logins, 0)} lượt login / 7 ngày
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {}
        <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground/80 mb-1">Tác vụ nhanh</p>
          <QuickAction
            icon={<Trophy size={16} />}
            label="Giải đấu mới"
            desc="Tạo giải, thêm thí sinh"
            onClick={() => navigate("/admin/tournaments")}
          />
          <QuickAction
            icon={<Gamepad2 size={16} />}
            label="Quản lý trận đấu"
            desc="Tạo / hoàn thành trận"
            onClick={() => navigate("/admin/game-managing")}
          />
          <QuickAction
            icon={<ClipboardCheck size={16} />}
            label="Duyệt bank"
            desc={`${state.pendingBank} câu chờ`}
            onClick={() => navigate("/admin/bank-review")}
          />
          <QuickAction
            icon={<Activity size={16} />}
            label="Sức khỏe hệ thống"
            desc={healthDesc}
            onClick={() => navigate("/admin/health")}
          />
        </div>

        {}
        <div className="rounded-xl bg-accent/50 border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground/80">Trận gần đây</p>
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/game-managing")}
              className="px-0 text-xs text-brand hover:text-brand"
            >
              Xem tất cả →
            </Button>
          </div>
          {recentMatches.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có trận nào.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentMatches.map((m) => (
                <div
                  key={m.id ?? m.matchCode}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-accent/50"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{m.matchName}</p>
                    <p className="text-[11px] text-muted-foreground ">{m.matchCode}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                      m.matchStatus === "finished" || m.matchStatus === "completed"
                        ? "bg-success/20 text-success"
                        : "bg-primary/20 text-brand"
                    }`}
                  >
                    {m.matchStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
          {recentTournaments.length > 0 && (
            <>
              <p className="text-sm font-semibold text-foreground/80 mt-4 mb-2">Giải gần đây</p>
              <div className="flex flex-col gap-1.5">
                {recentTournaments.map((t) => (
                  <Button
                    key={t.id}
                    variant="ghost"
                    onClick={() => navigate(`/admin/tournaments/${t.tournamentCode}`)}
                    className="h-auto justify-between gap-2 px-2 py-1.5 text-left"
                  >
                    <span className="text-sm text-foreground truncate">{t.tournamentName}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{t.status}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {}
        <div className="rounded-xl bg-accent/50 border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground/80 flex items-center gap-1.5">
              <ScrollText size={14} /> Nhật ký ({state.totalLogs})
            </p>
            <Button
              variant="ghost"
              onClick={() => navigate("/admin/audit")}
              className="px-0 text-xs text-brand hover:text-brand"
            >
              Xem tất cả →
            </Button>
          </div>
          {state.recentLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có log nào.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {state.recentLogs.map((log) => (
                <div key={log.id} className="px-2 py-1.5 rounded-lg hover:bg-accent/50">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-accent text-[11px]  font-bold text-foreground/80">
                      {log.actionType}
                    </span>
                    {log.matchCode && (
                      <span className="text-[11px]  text-muted-foreground">{log.matchCode}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {log.actorCode ?? "—"}
                    {log.createdAt ? ` · ${new Date(log.createdAt).toLocaleString("vi-VN")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
