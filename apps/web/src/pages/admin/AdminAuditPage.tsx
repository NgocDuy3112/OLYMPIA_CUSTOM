import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
          <ScrollText size={20} /> Nhật ký hệ thống
          <span className="font-mono text-sm font-normal text-muted-foreground">({total})</span>
        </h1>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void fetchLogs()}
          disabled={loading}
          className="bg-accent/50 border border-border hover:bg-accent disabled:opacity-50"
          title="Làm mới"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
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
        <Input
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Lọc actor code..."
          className="h-9 text-foreground placeholder:text-muted-foreground text-sm font-mono"
        />
        <Input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="Lọc match code..."
          className="h-9 text-foreground placeholder:text-muted-foreground text-sm font-mono"
        />
      </div>

      <div className="overflow-x-auto">
        {loading && logs.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Đang tải…</p>
        ) : logs.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Chưa có log nào.</p>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Thời gian</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Hành động</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Actor</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Match</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Chi tiết</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow
                  key={log.id}
                  className="border-b border-border/50 hover:bg-accent/50 align-top"
                >
                  <TableCell className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                    {log.createdAt
                      ? new Date(log.createdAt).toLocaleString("vi-VN")
                      : "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2">
                    <span className="px-2 py-0.5 rounded bg-accent text-foreground/80 text-xs font-mono font-bold">
                      {log.actionType}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 px-2 font-mono text-xs text-muted-foreground">
                    {log.actorCode ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 font-mono text-xs text-muted-foreground">
                    {log.matchCode ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-xs text-muted-foreground max-w-xs truncate">
                    {log.details ?? log.targetCode ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default AdminAuditPage;
