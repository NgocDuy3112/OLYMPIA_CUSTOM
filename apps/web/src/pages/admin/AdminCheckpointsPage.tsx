import { useCallback, useState } from "react";
import { DatabaseBackup, RefreshCw, RotateCcw } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  createDataTableColumns,
} from "@/components/shared/data-table";

const logger = createLogger("AdminCheckpointsPage");

interface Checkpoint {
  id: string;
  matchCode: string;
  createdAt?: string;
}

const helper = createDataTableColumns<Checkpoint>();

const columns = helper.columns([
  helper.accessor("id", {
    header: "ID",
    cell: (info) => (
      <span className="flex items-center font-mono text-xs text-foreground/80">
        {info.getValue().slice(0, 8)}…
        {info.row.index === 0 && (
          <span className="ml-2 rounded bg-success/20 px-2 py-0.5 text-[11px] font-bold text-success">
            MỚI NHẤT
          </span>
        )}
      </span>
    ),
  }),
  helper.accessor("matchCode", {
    header: "Match",
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground">
        {info.getValue()}
      </span>
    ),
  }),
  helper.accessor("createdAt", {
    header: "Thời gian",
    enableSorting: false,
    cell: (info) => (
      <span className="text-xs text-muted-foreground">
        {info.getValue()
          ? new Date(info.getValue()!).toLocaleString("vi-VN")
          : "—"}
      </span>
    ),
  }),
]);

const AdminCheckpointsPage = () => {
  const [matchCode, setMatchCode] = useState("");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchCheckpoints = useCallback(async () => {
    if (!matchCode.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/checkpoints/${encodeURIComponent(matchCode.trim())}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setCheckpoints(Array.isArray(json.data) ? json.data : []);
      } else {
        logger.warn("Fetch checkpoints failed:", json.message);
        setCheckpoints([]);
      }
    } catch (err) {
      logger.error("Error fetching checkpoints:", err);
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, [matchCode]);

  const handleRestore = useCallback(async () => {
    if (!matchCode.trim()) return;
    if (
      !window.confirm(
        `Khôi phục Valkey từ checkpoint mới nhất của ${matchCode.trim()}?`,
      )
    )
      return;
    setRestoring(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/checkpoints/${encodeURIComponent(matchCode.trim())}/restore`,
        { method: "POST", credentials: "include" },
      );
      const json = await res.json();
      if (res.ok && json.status === "success") {
        alert("Đã khôi phục snapshot");
        await fetchCheckpoints();
      } else {
        alert(`Khôi phục thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error restoring checkpoint:", err);
      alert("Lỗi kết nối khi khôi phục");
    } finally {
      setRestoring(false);
    }
  }, [matchCode, fetchCheckpoints]);

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
        <DatabaseBackup size={20} /> Checkpoints
      </h1>

      <div className="flex gap-2">
        <Input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Nhập match code..."
          className="flex-1 h-9 text-foreground placeholder:text-muted-foreground font-mono text-sm"
        />
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void fetchCheckpoints()}
          disabled={loading || !matchCode.trim()}
          className="bg-accent/50 border border-border hover:bg-accent disabled:opacity-50"
          title="Tải checkpoints"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </Button>
        <Button
          variant="default"
          onClick={() => void handleRestore()}
          disabled={restoring || !matchCode.trim() || checkpoints.length === 0}
          className="gap-2 bg-warning hover:bg-warning/90 disabled:opacity-50 font-semibold text-sm text-warning-foreground"
        >
          <RotateCcw size={16} />
          {restoring ? "Đang khôi phục…" : "Khôi phục"}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={checkpoints}
        loading={loading}
        emptyText="Nhập match code rồi bấm tải. Job snapshot chạy mỗi 30s, giữ 10 bản mới nhất."
      />
    </div>
  );
};

export default AdminCheckpointsPage;
