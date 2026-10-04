import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ApiError, apiGet } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { FilterSelect } from "@/components/shared/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
} from "@/components/shared/data-table-core";

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

const helper = createDataTableColumns<AuditLog>();

const columns = helper.columns([
  helper.accessor("createdAt", {
    header: "Thời gian",
    cell: (info) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {info.getValue()
          ? new Date(info.getValue()!).toLocaleString("vi-VN")
          : "—"}
      </span>
    ),
  }),
  helper.accessor("actionType", {
    header: "Hành động",
    cell: (info) => (
      <span className="rounded bg-accent px-2 py-0.5  text-xs font-bold text-foreground/80">
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor("actorCode", {
    header: "Actor",
    cell: (info) => (
      <span className=" text-xs text-muted-foreground">
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  helper.accessor("matchCode", {
    header: "Match",
    cell: (info) => (
      <span className=" text-xs text-muted-foreground">
        {info.getValue() ?? "—"}
      </span>
    ),
  }),
  helper.accessor("details", {
    header: "Chi tiết",
    enableSorting: false,
    cell: (info) => (
      <span className="block max-w-xs truncate text-xs text-muted-foreground">
        {info.getValue() ?? info.row.original.targetCode ?? "—"}
      </span>
    ),
  }),
]);

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
      const json = await apiGet<{ logs?: AuditLog[] }>(
        `/audit-logs?${params}`,
      ).catch((err) => {
        if (err instanceof ApiError) {
          logger.warn("Fetch audit logs failed:", err.message);
          return null;
        }
        throw err;
      });
      if (json) {
        setLogs(json.data!.logs ?? []);
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
          className="h-9 text-foreground placeholder:text-muted-foreground text-sm "
        />
        <Input
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          placeholder="Lọc match code..."
          className="h-9 text-foreground placeholder:text-muted-foreground text-sm "
        />
      </div>

      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        emptyText="Chưa có log nào."
        pageSize={20}
      />
    </div>
  );
};

export default AdminAuditPage;
