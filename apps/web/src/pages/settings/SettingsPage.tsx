import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { ApiError, apiCall, apiGet, getApiErrorMessage } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { useAuth } from "@/hooks/useAuth";
import { PublicLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formInputClass, formLabelClass } from "@/components/shared/ui/form";
import { useConfirm } from "@/hooks/useConfirm";

const logger = createLogger("SettingsPage");

interface McpTokenMeta {
  name: string;
  userCode: string;
  createdBy?: string | null;
  createdAt?: string;
  revoked?: boolean;
}

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canUseMcp = user?.role === "admin" || user?.role === "operator";

  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const fetchTokens = useCallback(async () => {
    if (!user || !canUseMcp) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiGet<McpTokenMeta[]>("/mcp-tokens");
      if (Array.isArray(json.data)) {
        setTokens(
          (json.data as McpTokenMeta[]).filter(
            (t) => t.userCode === user.userCode,
          ),
        );
      } else {
        setError(json.message ?? "Không tải được danh sách token.");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(getApiErrorMessage(err, "Không tải được danh sách token."));
      } else {
        logger.error("Error fetching tokens:", err);
        setError("Lỗi kết nối khi tải token.");
      }
    } finally {
      setLoading(false);
    }
  }, [canUseMcp, user]);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  const createToken = useCallback(async () => {
    if (!user || !name.trim()) return;
    setCreating(true);
    setError(null);
    setFreshToken(null);
    setCopied(false);
    try {
      const json = await apiCall<{ token?: string }>("/mcp-tokens", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), userCode: user.userCode }),
      });
      const token = json.data?.token;
      if (!token) { setError("Tạo token thất bại"); return; }
      setFreshToken(token);
      setName("");
      await fetchTokens();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(getApiErrorMessage(err, "Tạo token thất bại."));
      } else {
        logger.error("Error creating token:", err);
        setError("Lỗi kết nối khi tạo token.");
      }
    } finally {
      setCreating(false);
    }
  }, [fetchTokens, name, user]);

  const revokeToken = useCallback(
    async (tokenName: string) => {
      const ok = await confirm({
        title: "Gỡ bỏ MCP token",
        description: "Các tích hợp đang dùng token này sẽ ngừng hoạt động. Bạn có muốn gỡ bỏ không?",
        confirmLabel: "Gỡ bỏ token",
        tone: "danger"
      });
      if (!ok) return;
      setRevoking(tokenName);
      setError(null);
      try {
        await apiCall(`/mcp-tokens/${encodeURIComponent(tokenName)}`, {
          method: "DELETE",
        });
        await fetchTokens();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(getApiErrorMessage(err, "Thu hồi token thất bại."));
        } else {
          logger.error("Error revoking token:", err);
          setError("Lỗi kết nối khi thu hồi token.");
        }
      } finally {
        setRevoking(null);
      }
    },
    [fetchTokens, confirm],
  );

  const copyToken = useCallback(async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      setCopied(true);
    } catch {
      setError("Không sao chép được — hãy copy thủ công.");
    }
  }, [freshToken]);

  if (!user) return null;

  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 text-foreground">
        <div>
          <h1 className="text-xl font-bold">Cài đặt</h1>
          <p className="text-sm text-muted-foreground">
            Tài khoản và tích hợp cá nhân của bạn.
          </p>
        </div>

        {error && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/15 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        <Card className="px-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-brand">
              {(user.userName ?? "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{user.userName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {user.userCode} · {user.email}
              </p>
            </div>
            <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold uppercase text-brand">
              {user.role}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/profile")}
            >
              Xem hồ sơ
            </Button>
          </div>
        </Card>

        <Card className="px-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-brand" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Tích hợp MCP</p>
              <p className="text-xs text-muted-foreground">
                Token dùng cho client MCP ngoài. Token chỉ hiển thị một lần khi
                tạo.
              </p>
            </div>
            {canUseMcp && (
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={() => void fetchTokens()}
                disabled={loading}
                title="Làm mới"
                className="bg-accent/50 border border-border hover:bg-accent"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
              </Button>
            )}
          </div>

          {!canUseMcp ? (
            <p className="text-sm text-muted-foreground">
              Chỉ tài khoản admin/operator dùng tích hợp MCP.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {freshToken && (
                <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
                  <p className="text-xs font-semibold text-warning">
                    Token đã tạo — chỉ hiển thị một lần. Sao chép và lưu ở nơi
                    an toàn.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-background/60 px-2 py-1.5 text-xs">
                      {freshToken}
                    </code>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => void copyToken()}
                      className="gap-1"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Đã chép" : "Sao chép"}
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setFreshToken(null);
                        setCopied(false);
                      }}
                    >
                      Đóng
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-56 flex-1 flex-col gap-1">
                  <span className={formLabelClass}>Tên token</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    className={formInputClass}
                  />
                </label>
                <Button
                  variant="default"
                  onClick={() => void createToken()}
                  disabled={creating || !name.trim()}
                  className="gap-1.5"
                >
                  <Plus size={15} />
                  {creating ? "Đang tạo…" : "Tạo token"}
                </Button>
              </div>

              {loading && tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Đang tải token…</p>
              ) : tokens.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Bạn chưa có token nào.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tokens.map((t) => {
                    const canRevoke =
                      !t.revoked &&
                      (user.role === "admin" || t.createdBy === user.userCode);
                    return (
                      <div
                        key={t.name}
                        className="flex items-center gap-3 rounded-xl border border-border bg-accent/50 px-3 py-2"
                      >
                        <KeyRound
                          size={15}
                          className="shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {t.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {t.createdAt
                              ? new Date(t.createdAt).toLocaleString("vi-VN")
                              : "-"}
                            {t.createdBy && t.createdBy !== user.userCode
                              ? ` · cấp bởi ${t.createdBy}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.revoked
                              ? "bg-muted text-muted-foreground"
                              : "bg-success/20 text-success"
                            }`}
                        >
                          {t.revoked ? "Đã thu hồi" : "Đang hoạt động"}
                        </span>
                        {canRevoke && (
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => void revokeToken(t.name)}
                            disabled={revoking === t.name}
                            title="Thu hồi token"
                          >
                            <Trash2 size={13} />
                            {revoking === t.name ? "…" : "Thu hồi"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
        {dialog}
      </div>
    </PublicLayout>
  );
};

export default SettingsPage;
