import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AdminHealthPage");

interface HealthRow {
  name: string;
  url: string;
  ok: boolean | null;
  detail: string;
}

const GRAFANA_URL =
  import.meta.env.VITE_GRAFANA_URL ?? "http://localhost:3000";
const OPIK_URL = import.meta.env.VITE_OPIK_URL ?? "http://localhost:5173";

const HealthDot = ({ ok }: { ok: boolean | null }) => (
  <span
    className={`inline-block w-2.5 h-2.5 rounded-full ${
      ok === null ? "bg-gray-500" : ok ? "bg-green-500" : "bg-red-500"
    }`}
  />
);

const AdminHealthPage = () => {
  const [rows, setRows] = useState<HealthRow[]>([
    { name: "API", url: `${API_BASE_URL.replace(/\/api$/, "")}/health`, ok: null, detail: "…" },
    { name: "AI Agent", url: "/agent-health", ok: null, detail: "…" },
  ]);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const apiUrl = `${API_BASE_URL.replace(/\/api$/, "")}/health`;
      const [apiRes, agentRes] = await Promise.allSettled([
        fetch(apiUrl, { credentials: "include" }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/agent/health`, { credentials: "include" }).then((r) =>
          r.json(),
        ),
      ]);
      setRows([
        {
          name: "API",
          url: apiUrl,
          ok: apiRes.status === "fulfilled" && apiRes.value?.status === "healthy",
          detail:
            apiRes.status === "fulfilled"
              ? JSON.stringify(apiRes.value).slice(0, 120)
              : String(apiRes.reason).slice(0, 120),
        },
        {
          name: "AI Agent",
          url: `${API_BASE_URL}/agent/health`,
          ok:
            agentRes.status === "fulfilled" &&
            (agentRes.value?.status === "ok" || agentRes.value?.status === "healthy"),
          detail:
            agentRes.status === "fulfilled"
              ? JSON.stringify(agentRes.value).slice(0, 120)
              : String(agentRes.reason).slice(0, 120),
        },
      ]);
    } catch (err) {
      logger.error("Health check failed:", err);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const allOk = rows.every((r) => r.ok === true);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-white">
          <Activity size={20} className="text-blue-400" /> Sức khỏe hệ thống
        </h1>
        <button
          onClick={() => void check()}
          disabled={checking}
          className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-xs text-white"
        >
          {checking ? "Đang kiểm tra…" : "Kiểm tra lại"}
        </button>
      </div>

      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${
          allOk
            ? "bg-green-600/10 border-green-600/20"
            : "bg-yellow-600/10 border-yellow-600/20"
        }`}
      >
        {allOk ? (
          <CheckCircle2 size={20} className="text-green-400" />
        ) : (
          <AlertTriangle size={20} className="text-yellow-400" />
        )}
        <p className="text-sm text-white">
          {allOk
            ? "Mọi service phản hồi tốt."
            : "Có service cần xem — chi tiết số liệu ở Grafana, trace agent ở Opik."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <HealthDot ok={r.ok} />
              <p className="font-semibold text-white">{r.name}</p>
            </div>
            <p className="text-xs text-gray-500 font-mono break-all">{r.url}</p>
            <p className="text-xs text-gray-400 font-mono break-all">{r.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={`${GRAFANA_URL}/d/olympia-ops`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3 hover:bg-white/10"
        >
          <Activity size={18} className="text-orange-400" />
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-1">
              Grafana <ExternalLink size={12} />
            </p>
            <p className="text-xs text-gray-500">
              Charts vận hành: latency, error, WS, agent calls
            </p>
          </div>
        </a>
        <a
          href={OPIK_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center gap-3 hover:bg-white/10"
        >
          <Activity size={18} className="text-purple-400" />
          <div>
            <p className="text-sm font-semibold text-white flex items-center gap-1">
              Opik <ExternalLink size={12} />
            </p>
            <p className="text-xs text-gray-500">
              Trace OCee: node, tool, vòng reflect từng conversation
            </p>
          </div>
        </a>
      </div>
      <p className="text-[11px] text-gray-500">
        Quy ước: Grafana chỉ số vận hành, Opik chỉ trace agent — không duplicate
        charts giữa hai nơi.
      </p>
    </div>
  );
};

export default AdminHealthPage;
