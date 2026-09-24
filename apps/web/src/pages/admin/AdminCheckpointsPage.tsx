import { useCallback, useState } from "react";
import { DatabaseBackup, RefreshCw, RotateCcw } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AdminCheckpointsPage");

interface Checkpoint {
  id: string;
  matchCode: string;
  createdAt?: string;
}

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
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
      <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
        <DatabaseBackup size={20} /> Checkpoints
      </h1>

      <div className="flex gap-2">
        <input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Nhập match code..."
          className="flex-1 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 font-mono text-sm"
        />
        <button
          onClick={() => void fetchCheckpoints()}
          disabled={loading || !matchCode.trim()}
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
          title="Tải checkpoints"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => void handleRestore()}
          disabled={restoring || !matchCode.trim() || checkpoints.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-semibold text-sm transition-colors"
        >
          <RotateCcw size={16} />
          {restoring ? "Đang khôi phục…" : "Khôi phục"}
        </button>
      </div>

      {checkpoints.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          Nhập match code rồi bấm tải. Job snapshot chạy mỗi 30s, giữ 10 bản
          mới nhất.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-white/10">
              <th className="py-2 px-2 font-medium">ID</th>
              <th className="py-2 px-2 font-medium">Match</th>
              <th className="py-2 px-2 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {checkpoints.map((c, idx) => (
              <tr
                key={c.id}
                className="border-b border-white/5 hover:bg-white/5 transition-colors"
              >
                <td className="py-2 px-2 font-mono text-xs text-gray-300">
                  {c.id.slice(0, 8)}…
                  {idx === 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded bg-green-600/20 text-green-300 text-[11px] font-bold">
                      MỚI NHẤT
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 font-mono text-xs text-gray-400">{c.matchCode}</td>
                <td className="py-2 px-2 text-xs text-gray-500">
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleString("vi-VN")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AdminCheckpointsPage;
