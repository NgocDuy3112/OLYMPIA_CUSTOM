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
}

interface UserRow {
  userCode: string;
  role: string;
  operatorScopes?: string | null;
}

interface AuditLog {
  id: string;
  actionType: string;
  actorCode?: string | null;
  matchCode?: string | null;
  createdAt?: string;
}

interface DashboardState {
  tournaments: Tournament[];
  matches: MatchRow[];
  users: UserRow[];
  pendingBank: number;
  approvedBank: number;
  rejectedBank: number;
  recentLogs: AuditLog[];
  totalLogs: number;
  actionCounts: { action: string; count: number }[];
  apiOk: boolean | null;
  agentOk: boolean | null;
}

const initialState: DashboardState = {
  tournaments: [],
  matches: [],
  users: [],
  pendingBank: 0,
  approvedBank: 0,
  rejectedBank: 0,
  recentLogs: [],
  totalLogs: 0,
  actionCounts: [],
  apiOk: null,
  agentOk: null,
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
  <button
    onClick={onClick}
    className="text-left rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-1 hover:bg-white/10 transition-colors"
  >
    <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
      {icon}
      {label}
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    {sub && <p className="text-xs text-gray-500">{sub}</p>}
  </button>
);

const BarRow = ({ label, value, max, color }: { label: string; value: number; max: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="w-32 shrink-0 text-[11px] text-gray-400 truncate" title={label}>{label}</span>
    <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }} />
    </div>
    <span className="w-8 text-right text-[11px] font-mono text-gray-300">{value}</span>
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
  <button
    onClick={onClick}
    className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3 hover:bg-white/10 hover:border-blue-500/50 transition-colors text-left"
  >
    <span className="p-2 rounded-lg bg-blue-600/20 text-blue-300">{icon}</span>
    <span>
      <span className="block text-sm font-semibold text-white">{label}</span>
      <span className="block text-xs text-gray-500">{desc}</span>
    </span>
  </button>
);

/** Tổng quan vận hành cho admin: số liệu + việc cần làm + lối tắt. */
const AdminDashboardPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, mRes, uRes, bPen, bApp, bRej, aRes] = await Promise.allSettled([
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

      // Health: fire-and-forget, không chặn dashboard
      let apiOk: boolean | null = null;
      let agentOk: boolean | null = null;
      try {
        const base = API_BASE_URL.replace(/\/api$/, "");
        const [apiH, agentH] = await Promise.allSettled([
          fetch(`${base}/health`, { credentials: "include" }).then((r) => r.json()),
          fetch(`${API_BASE_URL}/agent/health`, { credentials: "include" }).then((r) => r.json()),
        ]);
        if (apiH.status === "fulfilled") apiOk = apiH.value?.status === "healthy";
        else apiOk = false;
        if (agentH.status === "fulfilled")
          agentOk = agentH.value?.status === "ok" || agentH.value?.status === "healthy";
        else agentOk = false;
      } catch {
        /* giữ null -> hiển thị "—" */
      }

      setState({ tournaments, matches, users, pendingBank, approvedBank, rejectedBank, recentLogs, totalLogs, actionCounts, apiOk, agentOk });
    } catch (err) {
      logger.error("Error loading dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
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
  const bankBars = [
    { label: "pending", value: state.pendingBank },
    { label: "approved", value: state.approvedBank },
    { label: "rejected", value: state.rejectedBank },
  ];
  const maxBank = Math.max(1, ...bankBars.map((b) => b.value));
  const maxAction = Math.max(1, ...state.actionCounts.map((a) => a.count));

  const needsAttention: { label: string; path: string }[] = [];
  if (state.pendingBank > 0)
    needsAttention.push({ label: `${state.pendingBank} câu bank chờ duyệt`, path: "/admin/bank-review" });
  if (liveMatches > 0)
    needsAttention.push({ label: `${liveMatches} trận chưa hoàn thành`, path: "/admin/game-managing" });
  if (state.apiOk === false || state.agentOk === false)
    needsAttention.push({ label: "Có service lỗi — xem Sức khỏe", path: "/admin/health" });

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            Tổng quan vận hành — số liệu trực tiếp từ API.
          </p>
        </div>
        <button
          onClick={() => void fetchAll()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 text-sm"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      {/* Việc cần làm */}
      {needsAttention.length > 0 && (
        <div className="rounded-xl bg-amber-600/10 border border-amber-500/30 p-4">
          <p className="text-sm font-semibold text-amber-300 mb-2">Cần xử lý</p>
          <div className="flex flex-wrap gap-2">
            {needsAttention.map((n) => (
              <button
                key={n.label}
                onClick={() => navigate(n.path)}
                className="px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/40 text-amber-200 text-sm hover:bg-amber-600/30 transition-colors"
              >
                {n.label} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Số liệu */}
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
          sub={`${roleCount("player")} thí sinh · ${roleCount("admin")} admin · C${scopeCount("controller")}/Q${scopeCount("qauthor")}/M${scopeCount("mc")}`}
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

      {/* Biểu đồ phân bố */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-300">Trận theo trạng thái</p>
          {matchBars.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.value} max={maxMatch} color="bg-blue-500" />
          ))}
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-300">User theo vai trò</p>
          {roleBars.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.value} max={maxRole} color="bg-emerald-500" />
          ))}
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-300">Bank theo duyệt</p>
          {bankBars.map((b) => (
            <BarRow key={b.label} label={b.label} value={b.value} max={maxBank} color="bg-amber-500" />
          ))}
        </div>
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-300">Audit theo hành động (100 mới nhất)</p>
          {state.actionCounts.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa có log.</p>
          ) : (
            state.actionCounts.map((a) => (
              <BarRow key={a.action} label={a.action} value={a.count} max={maxAction} color="bg-purple-500" />
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Tác vụ nhanh */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-300 mb-1">Tác vụ nhanh</p>
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
            desc={`API ${state.apiOk === null ? "—" : state.apiOk ? "OK" : "LỖI"} · Agent ${state.agentOk === null ? "—" : state.agentOk ? "OK" : "LỖI"}`}
            onClick={() => navigate("/admin/health")}
          />
        </div>

        {/* Trận gần đây */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-300">Trận gần đây</p>
            <button
              onClick={() => navigate("/admin/game-managing")}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Xem tất cả →
            </button>
          </div>
          {recentMatches.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa có trận nào.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentMatches.map((m) => (
                <div
                  key={m.id ?? m.matchCode}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{m.matchName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{m.matchCode}</p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${
                      m.matchStatus === "finished" || m.matchStatus === "completed"
                        ? "bg-green-600/20 text-green-300"
                        : "bg-blue-600/20 text-blue-300"
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
              <p className="text-sm font-semibold text-gray-300 mt-4 mb-2">Giải gần đây</p>
              <div className="flex flex-col gap-1.5">
                {recentTournaments.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigate(`/admin/tournaments/${t.tournamentCode}`)}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-left"
                  >
                    <span className="text-sm text-white truncate">{t.tournamentName}</span>
                    <span className="shrink-0 text-[11px] text-gray-500">{t.status}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Nhật ký gần đây */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
              <ScrollText size={14} /> Nhật ký ({state.totalLogs})
            </p>
            <button
              onClick={() => navigate("/admin/audit")}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Xem tất cả →
            </button>
          </div>
          {state.recentLogs.length === 0 ? (
            <p className="text-xs text-gray-500">Chưa có log nào.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {state.recentLogs.map((log) => (
                <div key={log.id} className="px-2 py-1.5 rounded-lg hover:bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono font-bold text-gray-300">
                      {log.actionType}
                    </span>
                    {log.matchCode && (
                      <span className="text-[11px] font-mono text-gray-500">{log.matchCode}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
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
