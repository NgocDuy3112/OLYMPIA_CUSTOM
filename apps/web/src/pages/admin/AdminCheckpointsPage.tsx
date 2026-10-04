import { useCallback, useState } from "react";
import { RefreshCw, RotateCcw } from "lucide-react";
import { ApiError, apiCall, apiGet } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DataTable,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
} from "@/components/shared/data-table-core";
import { notifyError } from "@/lib/notify";

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
      <span className="flex items-center  text-xs text-foreground/80">
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
      <span className=" text-xs text-muted-foreground">
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
      const json = await apiGet<Checkpoint[]>(
        `/checkpoints/${encodeURIComponent(matchCode.trim())}`,
      ).catch((err) => {
        if (err instanceof ApiError) {
          logger.warn("Fetch checkpoints failed:", err.message);
          return null;
        }
        throw err;
      });
      setCheckpoints(json && Array.isArray(json.data) ? json.data : []);
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
      await apiCall(
        `/checkpoints/${encodeURIComponent(matchCode.trim())}/restore`,
        { method: "POST" },
      );
      notifyError("Đã khôi phục snapshot");
      await fetchCheckpoints();
    } catch (err) {
      if (err instanceof ApiError) {
        notifyError(`Khôi phục thất bại: ${err.message}`);
      } else {
        logger.error("Error restoring checkpoint:", err);
        notifyError("Lỗi kết nối khi khôi phục");
      }
    } finally {
      setRestoring(false);
    }
  }, [matchCode, fetchCheckpoints]);

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <div className="flex gap-2">
        <InputGroup className="h-9 flex-1">
          <InputGroupInput
            value={matchCode}
            onChange={(e) => setMatchCode(e.target.value)}
            placeholder="Nhập match code..."
            className=" text-sm"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => void fetchCheckpoints()}
              disabled={loading || !matchCode.trim()}
              title="Tải checkpoints"
              aria-label="Tải checkpoints"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
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
        pageSize={20}
      />
    </div>
  );
};

export default AdminCheckpointsPage;
