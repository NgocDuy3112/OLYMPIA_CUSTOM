import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AdminMcpTokensPage");

interface McpTokenMeta {
  name: string;
  userCode: string;
  createdBy?: string | null;
  createdAt?: string;
  revoked?: boolean;
}

/** Identity khả dụng — user thật role operator/admin (check lúc mint server-side). */
interface Identity {
  userCode: string;
  userName: string;
  role: string;
}

const AdminMcpTokensPage = () => {
  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [userCode, setUserCode] = useState("");
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

  const fetchIdentities = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/mcp-tokens/identities`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setIdentities(json.data ?? []);
      } else {
        logger.warn("Fetch identities failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching identities:", err);
    }
  }, []);

  useEffect(() => {
    void fetchTokens();
    void fetchIdentities();
  }, [fetchTokens, fetchIdentities]);

  const createToken = async () => {
    setError(null);
    setFreshToken(null);
    try {
      const res = await fetch(`${API_BASE_URL}/mcp-tokens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), userCode }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setFreshToken(json.data.token);
        setName("");
        setUserCode("");
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

  const identityLabel = (u: string) => {
    const id = identities.find((i) => i.userCode === u);
    return id ? `${id.userName} · ${id.role}` : u;
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
            Identity (userCode — role operator/admin)
            <select
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 outline-none focus:border-blue-500 min-w-64"
            >
              <option value="">— chọn user —</option>
              {identities.map((id) => (
                <option key={id.userCode} value={id.userCode}>
                  {id.userName} · {id.userCode} · {id.role}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => void createToken()}
            disabled={!name.trim() || !userCode}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Cấp
          </button>
        </div>
        {identities.length === 0 && (
          <p className="text-xs text-yellow-400/80">
            Chưa có user role operator/admin — tạo user trước.
          </p>
        )}
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
              <th className="px-3 py-2">Identity</th>
              <th className="px-3 py-2">Người cấp</th>
              <th className="px-3 py-2">Ngày cấp</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.name} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-3 py-2 font-mono">{t.name}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {t.userCode}
                  <span className="text-gray-500"> · {identityLabel(t.userCode)}</span>
                </td>
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
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
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
