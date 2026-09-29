import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AdminMcpTokensPage");

interface McpTokenMeta {
  name: string;
  role: string;
  scopes: string[];
  createdBy?: string | null;
  createdAt?: string;
  revoked?: boolean;
}

const ROLES = ["agent", "operator", "admin"];
const SCOPES = ["read", "bank", "judge"];

const AdminMcpTokensPage = () => {
  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("agent");
  const [scopes, setScopes] = useState<string[]>(["read"]);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/mcp-tokens`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setTokens(json.data ?? []);
      } else {
        logger.warn("Fetch tokens failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching tokens:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const createToken = async () => {
    setError(null);
    setFreshToken(null);
    try {
      const res = await fetch(`${API_BASE_URL}/mcp-tokens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role, scopes }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setFreshToken(json.data.token);
        setName("");
        void fetchTokens();
      } else {
        setError(json.message ?? "Tạo token thất bại");
      }
    } catch (err) {
      logger.error("Error creating token:", err);
      setError("Lỗi mạng");
    }
  };

  const revokeToken = async (tokenName: string) => {
    if (!window.confirm(`Thu hồi token "${tokenName}"?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/mcp-tokens/${encodeURIComponent(tokenName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        void fetchTokens();
      } else {
        setError(json.message ?? "Thu hồi thất bại");
      }
    } catch (err) {
      logger.error("Error revoking token:", err);
      setError("Lỗi mạng");
    }
  };

  const copyToken = async () => {
    if (freshToken) {
      await navigator.clipboard.writeText(freshToken);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
          <KeyRound size={20} /> MCP Tokens
          <span className="font-mono text-sm font-normal text-gray-500">({tokens.length})</span>
        </h1>
        <button
          onClick={() => void fetchTokens()}
          disabled={loading}
          className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
          title="Làm mới"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Plus size={16} /> Cấp token mới
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm">
            Tên (ai dùng)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd qauthor-a"
              className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 outline-none focus:border-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            Scopes
            <div className="flex gap-2">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={() => toggleScope(s)}
                  />
                  <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={() => void createToken()}
            disabled={!name.trim() || scopes.length === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Cấp
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {freshToken && (
          <div className="rounded-lg bg-green-950/50 border border-green-500/30 p-3 flex flex-col gap-2">
            <p className="text-sm text-green-300">
              Token hiện 1 lần duy nhất — copy ngay:
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all font-mono text-xs bg-black/40 rounded px-2 py-2">
                {freshToken}
              </code>
              <button
                onClick={() => void copyToken()}
                className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm"
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-white/10">
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Scopes</th>
              <th className="px-3 py-2">Người cấp</th>
              <th className="px-3 py-2">Ngày cấp</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.name} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 font-mono">{t.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.role}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.scopes.join(", ")}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.createdBy ?? "-"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {t.createdAt ? new Date(t.createdAt).toLocaleString("vi-VN") : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => void revokeToken(t.name)}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                    title="Thu hồi"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {tokens.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  Chưa có token nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminMcpTokensPage;
