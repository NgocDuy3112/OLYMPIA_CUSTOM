import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Gamepad2,
  Pause,
  RefreshCw,
  ScrollText,
  Trophy,
  Wrench,
} from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { apiGet } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

interface DashboardState {
  tournaments: Tournament[];
  matches: MatchRow[];
  pendingBank: number;
  approvedBank: number;
  bankByRound: BankRoundStat[];
  recentLogs: AuditLog[];
  totalLogs: number;
  apiOk: boolean | null;
  agentOk: boolean | null;
  apiMs: number | null;
  agentMs: number | null;
  checkedAt: string | null;
}

const BANK_ROUNDS = [
  { group: "Khởi động", rounds: "KD_C,KD_R" },
  { group: "Giải mã", rounds: "GM" },
  { group: "Bứt phá", rounds: "BP" },
  { group: "Về đích", rounds: "VD" },
];

const initialState: DashboardState = {
  tournaments: [],
  matches: [],
  pendingBank: 0,
  approvedBank: 0,
  bankByRound: [],
  recentLogs: [],
  totalLogs: 0,
  apiOk: null,
  agentOk: null,
  apiMs: null,
  agentMs: null,
  checkedAt: null,
};

const statusLabel = (status: string) => {
  const labels: Record<string, string> = {
    setup: "Chuẩn bị",
    active: "Đang diễn ra",
    in_progress: "Đang diễn ra",
    paused: "Tạm dừng",
    finished: "Đã kết thúc",
    completed: "Đã kết thúc",
  };
  return labels[status] ?? status;
};

const statusClass = (status: string) => {
  if (["active", "in_progress"].includes(status)) {
    return "border-success/30 bg-success/15 text-success";
  }
  if (status === "paused") return "border-warning/30 bg-warning/15 text-warning";
  if (["finished", "completed"].includes(status)) {
    return "border-border bg-muted text-muted-foreground";
  }
  return "border-primary/30 bg-primary/10 text-brand";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Chưa xếp lịch";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xếp lịch";
  return date.toLocaleString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return "Chưa thiết lập thời gian";
  const fmt = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start ?? end!);
};

const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const roundReqs = BANK_ROUNDS.flatMap((round) => [
        apiGet<{ total?: number }>(
          `/bank/search?round_hints=${encodeURIComponent(round.rounds)}&status=approved&limit=1&page=1`,
        ),
        apiGet<{ total?: number }>(
          `/bank/search?round_hints=${encodeURIComponent(round.rounds)}&status=pending&limit=1&page=1`,
        ),
      ]);
      const [tRes, mRes, bPen, bApp, aRes, ...roundRes] =
        await Promise.allSettled([
          apiGet<Tournament[]>("/tournaments"),
          apiGet<MatchRow[]>("/matches"),
          apiGet<{ total?: number }>("/bank/search?status=pending&limit=1&page=1"),
          apiGet<{ total?: number }>("/bank/search?status=approved&limit=1&page=1"),
          apiGet<{ logs?: AuditLog[]; total?: number }>("/audit-logs?limit=30"),
          ...roundReqs,
        ]);

      const tournaments =
        tRes.status === "fulfilled" && tRes.value?.status === "success" && Array.isArray(tRes.value.data)
          ? tRes.value.data
          : [];
      const matches =
        mRes.status === "fulfilled" && mRes.value?.status === "success" && Array.isArray(mRes.value.data)
          ? mRes.value.data
          : [];
      const bankTotal = (result: unknown) =>
        typeof result === "object" && result !== null &&
        (result as { status?: string }).status === "success"
          ? Number((result as { data?: { total?: number } }).data?.total ?? 0)
          : 0;
      const settledTotal = (result: PromiseSettledResult<unknown> | undefined) =>
        result?.status === "fulfilled" ? bankTotal(result.value) : 0;
      const bankByRound = BANK_ROUNDS.map((round, index) => ({
        ...round,
        approved: settledTotal(roundRes[index * 2]),
        pending: settledTotal(roundRes[index * 2 + 1]),
      }));
      const logs =
        aRes.status === "fulfilled" && aRes.value?.status === "success"
          ? aRes.value.data?.logs ?? []
          : [];

      let apiOk: boolean | null = null;
      let agentOk: boolean | null = null;
      let apiMs: number | null = null;
      let agentMs: number | null = null;
      const base = API_BASE_URL.replace(/\/api$/, "");
      const timed = async (url: string) => {
        const started = performance.now();
        try {
          const response = await fetch(url, { credentials: "include" });
          const body = await response.json();
          return { ms: Math.round(performance.now() - started), body };
        } catch {
          return { ms: null, body: null };
        }
      };
      const [apiHealth, agentHealth] = await Promise.all([
        timed(`${base}/health`),
        timed(`${API_BASE_URL}/agent/health`),
      ]);
      apiMs = apiHealth.ms;
      agentMs = agentHealth.ms;
      apiOk = (apiHealth.body as { status?: string } | null)?.status === "healthy";
      const agentStatus = (agentHealth.body as { status?: string } | null)?.status;
      agentOk = agentStatus === "ok" || agentStatus === "healthy";

      setState({
        tournaments,
        matches,
        pendingBank: bPen.status === "fulfilled" ? bankTotal(bPen.value) : 0,
        approvedBank: bApp.status === "fulfilled" ? bankTotal(bApp.value) : 0,
        bankByRound,
        recentLogs: logs,
        totalLogs:
          aRes.status === "fulfilled" && aRes.value?.status === "success"
            ? Number(aRes.value.data?.total ?? logs.length)
            : 0,
        apiOk,
        agentOk,
        apiMs,
        agentMs,
        checkedAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      });
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
    const timer = setInterval(() => void fetchAll(true), 60000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const liveMatches = state.matches.filter((match) =>
    ["active", "in_progress"].includes(match.matchStatus),
  );
  const pausedMatches = state.matches.filter((match) => match.matchStatus === "paused");
  const activeTournaments = state.tournaments.filter((tournament) => tournament.status === "active");
  const completedMatches = state.matches.filter((match) =>
    ["finished", "completed"].includes(match.matchStatus),
  ).length;

  const priorityMatches = useMemo(() => {
    const relevant = state.matches.filter((match) =>
      ["active", "in_progress", "paused", "setup"].includes(match.matchStatus),
    );
    const priority = (status: string) =>
      ["active", "in_progress"].includes(status) ? 0 : status === "paused" ? 1 : 2;
    return [...relevant]
      .sort((a, b) => {
        const priorityDiff = priority(a.matchStatus) - priority(b.matchStatus);
        if (priorityDiff) return priorityDiff;
        const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
        const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
        return aTime - bTime;
      })
      .slice(0, 6);
  }, [state.matches]);

  const tournamentProgress = useMemo(() => {
    const counts = new Map<string, { total: number; completed: number }>();
    state.matches.forEach((match) => {
      if (!match.tournamentId) return;
      const value = counts.get(match.tournamentId) ?? { total: 0, completed: 0 };
      value.total += 1;
      if (["finished", "completed"].includes(match.matchStatus)) value.completed += 1;
      counts.set(match.tournamentId, value);
    });
    return counts;
  }, [state.matches]);

  const needsAttention = [
    ...(state.pendingBank > 0
      ? [{ label: `${state.pendingBank} câu hỏi đang chờ duyệt`, path: "/admin/bank-review", icon: ClipboardCheck }]
      : []),
    ...pausedMatches.slice(0, 2).map((match) => ({
      label: `${match.matchName || match.matchCode} đang tạm dừng`,
      path: "/admin/game-managing",
      icon: Pause,
    })),
    ...(state.apiOk === false || state.agentOk === false
      ? [{ label: "Có dịch vụ đang gặp sự cố", path: "/admin/health", icon: Activity }]
      : []),
  ];

  const serviceRows = [
    { label: "API", ok: state.apiOk, ms: state.apiMs },
    { label: "AI Agent", ok: state.agentOk, ms: state.agentMs },
  ];

  const tournamentNames = new Map(state.tournaments.map((tournament) => [tournament.id, tournament.tournamentName]));
  const orderedLogs = state.recentLogs
    .filter((log) => log.actionType !== "LOGIN")
    .sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );

  return (
    <div className="mx-auto flex w-full max-w-375 flex-col gap-5 pb-8 text-foreground">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Olympia Custom · Admin</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Tổng quan vận hành</h1>
          <p className="text-sm text-muted-foreground">
            Theo dõi trận đấu, hàng chờ nội dung và tình trạng hệ thống.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {state.checkedAt ? `Cập nhật ${state.checkedAt}` : "Đang kết nối dữ liệu"}
          </span>
          <Button
            variant="outline"
            onClick={() => void fetchAll()}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Đang tải" : "Làm mới"}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Chỉ số vận hành">
        <MetricCard
          label="Trận đang diễn ra"
          value={liveMatches.length}
          detail={`${completedMatches} trận đã kết thúc`}
          icon={<Gamepad2 size={18} />}
          tone="violet"
          onClick={() => navigate("/admin/game-managing")}
        />
        <MetricCard
          label="Giải đang hoạt động"
          value={activeTournaments.length}
          detail={`${state.tournaments.length} giải trong hệ thống`}
          icon={<Trophy size={18} />}
          tone="amber"
          onClick={() => navigate("/admin/tournaments")}
        />
        <MetricCard
          label="Câu hỏi chờ duyệt"
          value={state.pendingBank}
          detail={`${state.approvedBank} câu đã duyệt`}
          icon={<ClipboardCheck size={18} />}
          tone={state.pendingBank > 0 ? "amber" : "green"}
          onClick={() => navigate("/admin/bank-review")}
        />
      </section>

      {needsAttention.length > 0 && (
        <section className="rounded-xl border border-warning/30 bg-warning/[0.07] p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-warning/15 text-warning">
              <AlertTriangle size={17} />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Cần chú ý</h2>
              <p className="text-xs text-muted-foreground">Các việc có thể cần admin xử lý</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {needsAttention.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.path}-${item.label}-${index}`}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="group flex min-h-12 items-center gap-3 rounded-lg border border-warning/20 bg-background/40 px-3 py-2 text-left transition-colors hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon size={16} className="shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                  <ArrowRight size={15} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader className="border-b border-border/70">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-brand">
                <Gamepad2 size={18} />
              </span>
              <div>
                <CardTitle>Trận đấu cần theo dõi</CardTitle>
                <CardDescription className="mt-1">
                  Ưu tiên trận đang chạy, tạm dừng và các trận chuẩn bị.
                </CardDescription>
              </div>
            </div>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/game-managing")} className="gap-1 text-brand">
                Lịch thi đấu <ArrowRight size={14} />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-3">
            {priorityMatches.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                    <CalendarDays size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Không có trận cần theo dõi</p>
                    <p className="text-xs text-muted-foreground">Các trận đang chạy hoặc sắp diễn ra sẽ hiện tại đây.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/game-managing")} className="gap-1.5">
                  Mở lịch <ArrowRight size={14} />
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/70">
                {priorityMatches.map((match) => (
                  <button
                    key={match.id ?? match.matchCode}
                    type="button"
                    onClick={() => navigate("/admin/game-managing")}
                    className="flex w-full flex-col gap-2 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
                      {match.matchStatus === "paused" ? <Pause size={16} /> : <Gamepad2 size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{match.matchName || match.matchCode}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {match.matchCode}
                        {match.tournamentId && tournamentNames.get(match.tournamentId)
                          ? ` · ${tournamentNames.get(match.tournamentId)}`
                          : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground sm:w-36">
                      <Clock3 size={13} /> {formatDateTime(match.scheduledAt)}
                    </span>
                    <Badge variant="outline" className={statusClass(match.matchStatus)}>
                      {statusLabel(match.matchStatus)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader className="border-b border-border/70">
              <div className="flex items-start gap-3">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${state.pendingBank ? "bg-warning/15 text-warning" : "bg-success/15 text-success"}`}>
                  <ClipboardCheck size={18} />
                </span>
                <div>
                  <CardTitle>Hàng chờ duyệt</CardTitle>
                  <CardDescription className="mt-1">Nội dung bank theo vòng thi</CardDescription>
                </div>
              </div>
              <CardAction>
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin/bank-review")} className="text-brand">
                  Mở hàng chờ
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="mb-3 flex items-baseline gap-2">
                <span className={`text-3xl font-bold tracking-tight ${state.pendingBank ? "text-warning" : "text-foreground"}`}>
                  {state.pendingBank}
                </span>
                <span className="text-sm text-muted-foreground">câu đang chờ</span>
              </div>
              <div className="space-y-2">
                {state.bankByRound.map((round) => (
                  <div key={round.group} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{round.group}</span>
                    <span className="font-medium tabular-nums">
                      <span className={round.pending ? "text-warning" : "text-foreground"}>{round.pending} chờ</span>
                      <span className="mx-1.5 text-border">·</span>
                      <span>{round.approved} duyệt</span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-brand" />
                <CardTitle className="text-sm">Tình trạng hệ thống</CardTitle>
              </div>
              <CardAction>
                <Button variant="ghost" size="xs" onClick={() => navigate("/admin/health")} className="text-brand">
                  Chi tiết
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-2">
              {serviceRows.map((service) => (
                <div key={service.label} className="flex items-center justify-between rounded-lg bg-accent/35 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    {service.ok === true ? (
                      <CheckCircle2 size={15} className="text-success" />
                    ) : service.ok === false ? (
                      <AlertTriangle size={15} className="text-destructive" />
                    ) : (
                      <span className="size-3.5 rounded-full border-2 border-muted-foreground/40" />
                    )}
                    {service.label}
                  </span>
                  <span className={`text-xs font-medium ${service.ok === false ? "text-destructive" : service.ok === true ? "text-success" : "text-muted-foreground"}`}>
                    {service.ok === null ? "Đang kiểm tra" : service.ok ? `Ổn định${service.ms !== null ? ` · ${service.ms}ms` : ""}` : "Có lỗi"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {(activeTournaments.length > 0 || orderedLogs.length > 0) && (
      <section className={`grid items-start gap-4 ${activeTournaments.length > 0 && orderedLogs.length > 0 ? "lg:grid-cols-12" : "lg:grid-cols-1"}`}>
        {activeTournaments.length > 0 && <Card className={orderedLogs.length > 0 ? "lg:col-span-7" : ""}>
          <CardHeader className="border-b border-border/70">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                <Trophy size={18} />
              </span>
              <div>
                <CardTitle>Giải đấu đang hoạt động</CardTitle>
                <CardDescription className="mt-1">Tiến độ được tính từ trạng thái các trận đã gán giải.</CardDescription>
              </div>
            </div>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/tournaments")} className="gap-1 text-brand">
                Tất cả giải <ArrowRight size={14} />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-3">
              <div className="divide-y divide-border/70">
                {activeTournaments.slice(0, 5).map((tournament) => {
                  const progress = tournamentProgress.get(tournament.id) ?? { total: 0, completed: 0 };
                  const percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
                  return (
                    <button
                      key={tournament.id}
                      type="button"
                      onClick={() => navigate(`/admin/tournaments/${tournament.tournamentCode}`)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-warning">
                        <Trophy size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{tournament.tournamentName}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatDateRange(tournament.startDate, tournament.endDate)}
                        </span>
                      </span>
                      <span className="hidden w-28 sm:block">
                        <span className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                          <span>{progress.completed}/{progress.total} trận</span><span>{percent}%</span>
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-accent">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </span>
                      </span>
                      <Badge variant="outline" className="border-success/30 bg-success/10 text-success">Đang mở</Badge>
                    </button>
                  );
                })}
              </div>
          </CardContent>
        </Card>}

        {orderedLogs.length > 0 && <Card className={activeTournaments.length > 0 ? "lg:col-span-5" : ""}>
          <CardHeader className="border-b border-border/70">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-brand">
                <ScrollText size={18} />
              </span>
              <div>
                <CardTitle>Hoạt động gần đây</CardTitle>
                <CardDescription className="mt-1">{state.totalLogs} bản ghi trong nhật ký</CardDescription>
              </div>
            </div>
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => navigate("/admin/audit")} className="gap-1 text-brand">
                Nhật ký <ArrowRight size={14} />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="pt-3">
              <div className="divide-y divide-border/70">
                {orderedLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
                      <Activity size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-[10px]">{log.actionType}</Badge>
                        {log.matchCode && <span className="text-xs text-muted-foreground">Trận {log.matchCode}</span>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {log.actorCode ?? "Không rõ người dùng"}
                        {log.createdAt ? ` · ${new Date(log.createdAt).toLocaleString("vi-VN")}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
          </CardContent>
        </Card>}
      </section>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
        <p className="text-xs text-muted-foreground">
          Tự cập nhật mỗi phút{state.checkedAt ? ` · lần gần nhất ${state.checkedAt}` : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/game-managing")} className="gap-1.5">
            <CalendarDays size={14} /> Lịch thi đấu
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/tournaments")} className="gap-1.5">
            <Wrench size={14} /> Quản trị giải
          </Button>
        </div>
      </footer>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  detail,
  icon,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone: "violet" | "amber" | "green" | "blue";
  onClick: () => void;
}) => {
  const tones = {
    violet: "bg-primary/15 text-brand",
    amber: "bg-warning/15 text-warning",
    green: "bg-success/15 text-success",
    blue: "bg-info/15 text-info",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-32 flex-col justify-between rounded-xl border border-border/80 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/40 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`flex size-9 items-center justify-center rounded-lg ${tones[tone]}`}>{icon}</span>
      </span>
      <span className="mt-2 flex items-end justify-between gap-3">
        <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        <ArrowRight size={16} className="mb-1 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{detail}</span>
    </button>
  );
};

export default AdminDashboardPage;
