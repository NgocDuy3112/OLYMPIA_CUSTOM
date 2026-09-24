import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { FilterSelect } from "@/components/shared/FilterSelect";

const logger = createLogger("AdminAuditPage");

interface AuditLog {
  id: string;
  actionType: string;
  actorCode?: string | null;
  matchCode?: string | null;
  targetCode?: string | null;
  details?: string | null;
  createdAt?: string;
}

const ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "SCORE_CHANGE",
  "MATCH_STATE_CHANGE",
  "PLAYER_JOIN",
  "PLAYER_LEAVE",
  "QUESTION_USED",
  "MATCH_CREATED",
  "MATCH_DELETED",
];

const AdminAuditPage = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [match, setMatch] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (actor.trim()) params.set("actor", actor.trim());
      if (match.trim()) params.set("match", match.trim());
      params.set("limit", "100");
      const res = await fetch(`${API_BASE_URL}/audit-logs?${params}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setLogs(json.data.logs ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        logger.warn("Fetch audit logs failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [action, actor, match]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
          <ScrollText size={20} /> Nhật ký hệ thống
          <span className="font-mono text-sm font-normal text-gray-500">({total})</span>
        </h1>
        <button
          onClick={() => void fetchLogs()}
          disabled={loading}
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
          title="Làm mới"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <FilterSelect value={action} onChange={setAction} aria-label="Lọc hành động">
          <option value="">Tất cả hành động</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </FilterSelect>
        <input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Lọc actor code..."
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 text-sm font-mono"
        />
        <input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="Lọc match code..."
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 text-sm font-mono"
        />
      </div>

      <div className="overflow-x-auto">
        {loading && logs.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">Đang tải…</p>
        ) : logs.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center">Chưa có log nào.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-black/40 backdrop-blur">
              <tr className="text-left text-gray-500 border-b border-white/10">
                <th className="py-2 px-2 font-medium">Thời gian</th>
                <th className="py-2 px-2 font-medium">Hành động</th>
                <th className="py-2 px-2 font-medium">Actor</th>
                <th className="py-2 px-2 font-medium">Match</th>
                <th className="py-2 px-2 font-medium">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-white/5 hover:bg-white/5 transition-colors align-top"
                >
                  <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString("vi-VN")
                      : "—"}
                  </td>
                  <td className="py-2 px-2">
                    <span className="px-2 py-0.5 rounded bg-white/10 text-gray-300 text-xs font-mono font-bold">
                      {log.actionType}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-gray-400">
                    {log.actorCode ?? "—"}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-gray-400">
                    {log.matchCode ?? "—"}
                  </td>
                  <td className="py-2 px-2 text-xs text-gray-500 max-w-xs truncate">
                    {log.details ?? log.targetCode ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminAuditPage;
