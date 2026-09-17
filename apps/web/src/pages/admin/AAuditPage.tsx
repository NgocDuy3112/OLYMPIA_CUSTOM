import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AAuditPage");

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

const AAuditPage = () => {
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
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white">
      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
            <ScrollText size={20} /> Nhật ký hệ thống ({total})
          </h2>
          <button
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white text-sm"
          >
            <option value="">Tất cả hành động</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Lọc actor code..."
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 text-sm font-mono"
          />
          <input
            value={match}
            onChange={(e) => setMatch(e.target.value)}
            placeholder="Lọc match code..."
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 text-sm font-mono"
          />
        </div>

        <div className="overflow-y-auto flex-1 -mr-2 pr-2 max-h-[70vh]">
          {loading && logs.length === 0 ? (
            <p className="text-gray-400 text-sm">Đang tải…</p>
          ) : logs.length === 0 ? (
            <p className="text-gray-400 text-sm">Chưa có log nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-blue-900">
                <tr className="text-left text-blue-300 border-b border-blue-700">
                  <th className="py-2 px-2">Thời gian</th>
                  <th className="py-2 px-2">Hành động</th>
                  <th className="py-2 px-2">Actor</th>
                  <th className="py-2 px-2">Match</th>
                  <th className="py-2 px-2">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors align-top"
                  >
                    <td className="py-2 px-2 text-xs text-gray-400 whitespace-nowrap">
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleString("vi-VN")
                        : "—"}
                    </td>
                    <td className="py-2 px-2">
                      <span className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/50 text-xs font-mono font-bold">
                        {log.actionType}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-mono text-xs">
                      {log.actorCode ?? "—"}
                    </td>
                    <td className="py-2 px-2 font-mono text-xs">
                      {log.matchCode ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-300 max-w-xs truncate">
                      {log.details ?? log.targetCode ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AAuditPage;
