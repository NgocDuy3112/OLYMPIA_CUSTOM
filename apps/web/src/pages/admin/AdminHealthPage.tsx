import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";

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
      ok === null ? "bg-muted-foreground" : ok ? "bg-success" : "bg-destructive"
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
      <div className="flex justify-end">
        <Button
          variant="default"
          onClick={() => void check()}
          disabled={checking}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-xs text-foreground"
        >
          {checking ? "Đang kiểm tra…" : "Kiểm tra lại"}
        </Button>
      </div>

      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${
          allOk
            ? "bg-success/10 border-success/20"
            : "bg-warning/10 border-warning/20"
        }`}
      >
        {allOk ? (
          <CheckCircle2 size={20} className="text-success" />
        ) : (
          <AlertTriangle size={20} className="text-warning" />
        )}
        <p className="text-sm text-foreground">
          {allOk
            ? "Mọi service phản hồi tốt."
            : "Có service cần xem — chi tiết số liệu ở Grafana, trace agent ở Opik."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div
            key={r.name}
            className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <HealthDot ok={r.ok} />
              <p className="font-semibold text-foreground">{r.name}</p>
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all">{r.url}</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{r.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a
          href={`${GRAFANA_URL}/d/olympia-ops`}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-accent/50 border border-border p-4 flex items-center gap-3 hover:bg-accent"
        >
          <Activity size={18} className="text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1">
              Grafana <ExternalLink size={12} />
            </p>
            <p className="text-xs text-muted-foreground">
              Charts vận hành: latency, error, WS, agent calls
            </p>
          </div>
        </a>
        <a
          href={OPIK_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl bg-accent/50 border border-border p-4 flex items-center gap-3 hover:bg-accent"
        >
          <Activity size={18} className="text-purple" />
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1">
              Opik <ExternalLink size={12} />
            </p>
            <p className="text-xs text-muted-foreground">
              Trace OCee: node, tool, vòng reflect từng conversation
            </p>
          </div>
        </a>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Quy ước: Grafana chỉ số vận hành, Opik chỉ trace agent — không duplicate
        charts giữa hai nơi.
      </p>
    </div>
  );
};

export default AdminHealthPage;
