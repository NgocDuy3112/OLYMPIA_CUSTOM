import React, { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  ApiError,
  apiCall,
  apiGet,
  getApiErrorMessage,
} from "@/api/client";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DataTable,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
  type DataTableColumn,
} from "@/components/shared/data-table-core";
import { useConfirm } from "@/hooks/useConfirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formInputClass } from "@/components/shared/ui/form";

const logger = createLogger("AdminMcpTokensPage");

interface McpTokenMeta {
  name: string;
  userCode: string;
  createdBy?: string | null;
  createdAt?: string;
  revoked?: boolean;
}

const helper = createDataTableColumns<McpTokenMeta>();

interface Identity {
  userCode: string;
  userName: string;
  role: string;
}

const AdminMcpTokensPage = () => {
  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [userCode, setUserCode] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {confirm, dialog} = useConfirm();

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiGet<McpTokenMeta[]>("/mcp-tokens").catch((err) => {
        if (err instanceof ApiError) {
          logger.warn("Fetch tokens failed:", err.message);
          return null;
        }
        throw err;
      });
      if (json) {
        setTokens(json.data ?? []);
      }
    } catch (err) {
      logger.error("Error fetching tokens:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIdentities = useCallback(async () => {
    try {
      const json = await apiGet<Identity[]>("/mcp-tokens/identities").catch(
        (err) => {
          if (err instanceof ApiError) {
            logger.warn("Fetch identities failed:", err.message);
            return null;
          }
          throw err;
        },
      );
      if (json) {
        setIdentities(json.data ?? []);
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
    if (creating) return;
    setError(null);
    setFreshToken(null);
    setCreating(true);
    try {
      const json = await apiCall<{ token: string }>("/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), userCode }),
      });
      const token = json.data?.token;
      if (!token) {
        setError("Không thể tạo token từ server");
        return;
      }
      setFreshToken(token);
      setName("");
      setUserCode("");
      void fetchTokens();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(getApiErrorMessage(err, "Không thể tạo token"));
      } else {
        logger.error("Error creating token:", err instanceof Error ? err.message : err);
        setError("Lỗi mạng");
      }
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = useCallback(async (tokenName: string) => {
    const ok = await confirm({
      title: "Gỡ bỏ MCP token",
      description: `Bạn có đồng ý thu hồi token ${tokenName} không?`,
      confirmLabel: "Gỡ bỏ token",
      tone: "danger"
    });
    if (!ok) return;
    try {
      await apiCall(`/mcp-tokens/${encodeURIComponent(tokenName)}`, {
        method: "DELETE",
      });
      notifySuccess(`Đã thu hồi token ${tokenName}`);
      void fetchTokens();
    } catch (err) {
      if (err instanceof ApiError) {
        notifyError(`Thu hồi thất bại: ${getApiErrorMessage(err, "Lỗi không xác định")}`);
      } else {
        logger.error("Error revoking token:", err instanceof Error ? err.message : err);
        notifyError("Lỗi kết nối khi thu hồi token");
      }
    }
  }, [fetchTokens, confirm]);

  const copyToken = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      notifySuccess("Đã copy token");
    } catch {
      notifyError("Token chưa được copy");
    }
  };

  const columns: DataTableColumn<McpTokenMeta>[] = React.useMemo(
    () => [
      helper.accessor("name", {
        header: "Tên",
        cell: (info) => <span className="text-xs">{info.getValue()}</span>,
      }),
      helper.accessor("userCode", {
        header: "Identity",
        cell: (info) => {
          const u = info.getValue();
          const id = identities.find((i) => i.userCode === u);
          return (
            <span className="text-xs">
              {u}
              <span className="text-muted-foreground">
                - {id ? `${id.userName} - ${id.role}` : "-"}
              </span>
            </span>
          );
        },
      }),
      helper.accessor("createdBy", {
        header: "Người cấp",
        cell: (info) => (
          <span className="text-xs">{info.getValue() ?? "-"}</span>
        ),
      }),
      helper.accessor("createdAt", {
        header: "Ngày cấp",
        cell: (info) => {
          const v = info.getValue();
          return (
            <span className="text-xs">{v ? new Date(v).toLocaleString("vi-VN") : "-"}</span>
          )
        },
      }),
      helper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (info) => (
          <span className="flex justify-end">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => void revokeToken(info.row.original.name)}
              className="text-destructive hover:bg-destructive/10"
              title="Thu hồi"
              aria-label={`Thu hồi token ${info.row.original.name}`}
            >
              <Trash2 size={16} />
            </Button>
          </span>
        ),
      }),
    ],
    [identities, revokeToken],
  );

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          ({tokens.length} token)
        </span>
        <Button
          size="icon"
          variant="secondary"
          onClick={() => void fetchTokens()}
          disabled={loading}
          className="bg-accent/50 border border-border hover:bg-accent disabled:opacity-50"
          title="Làm mới"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Plus size={16} /> Cấp token mới
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex flex-col gap-1 text-sm">
            Tên (ai dùng)
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="vd qauthor-a"
              className={formInputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Identity (userCode — role operator/admin)
            <NativeSelect
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              className="min-w-64"
            >
              <option value="">— chọn user —</option>
              {identities.map((id) => (
                <option key={id.userCode} value={id.userCode}>
                  {id.userName} · {id.userCode} · {id.role}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Button
            variant="default"
            onClick={() => void createToken()}
            disabled={creating || !name.trim() || !userCode}
            className="disabled:opacity-50"
          >
            {creating ? "Đang tạo token..." : "Tạo token"}
          </Button>
        </div>
        {identities.length === 0 && (
          <p className="text-xs text-warning">
            Chưa có user role operator/admin — tạo user trước.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {freshToken && (
          <div className="rounded-lg bg-success/10 border border-success/30 p-3 flex flex-col gap-2">
            <p className="text-sm text-success">
              Token hiện 1 lần duy nhất — copy ngay:
            </p>
            <div className="flex gap-2 items-center">
              <code className="flex-1 break-all text-xs bg-background/40 rounded px-2 py-2">
                {freshToken}
              </code>
              <Button
                variant="default"
                onClick={() => void copyToken()}
                className="bg-success/80 hover:bg-success text-sm"
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        data={tokens}
        loading={loading}
        emptyText="Chưa có token nào"
        pageSize={20}
      />

      {dialog}
    </div>
  );
};

export default AdminMcpTokensPage;
