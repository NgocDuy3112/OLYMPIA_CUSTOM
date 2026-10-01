import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Users } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  UserEditPanel,
  UserAddPanel,
  UserRolePanel,
  UserDeletePanel,
  type GlobalRole,
  type UserEditValue,
  type UserAddValue,
  type UserRoleValue,
} from "@/components/admin/UserPanels";
import { UserRowActions } from "@/components/admin/UserRowActions";
import { FilterSelect } from "@/components/shared/FilterSelect";

const logger = createLogger("AdminUsersPage");

interface UserData {
  user_code: string;
  user_name: string;
  email: string | null;
  role: GlobalRole;
  operator_scopes?: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

/** API trả camelCase — map về snake_case nội bộ trang Admin. */
const toUserData = (r: Record<string, unknown>): UserData => ({
  user_code: String(r.userCode ?? r.user_code ?? ""),
  user_name: String(r.userName ?? r.user_name ?? ""),
  email: (r.email as string | null) ?? null,
  role: String(r.role ?? "player") as GlobalRole,
  operator_scopes:
    (r.operatorScopes as string | null) ??
    (r.operator_scopes as string | null) ??
    null,
  created_at: String(r.createdAt ?? r.created_at ?? ""),
  updated_at: String(r.updatedAt ?? r.updated_at ?? ""),
});

const AdminUsersPage = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Panel: thêm user
  const [showAdd, setShowAdd] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);

  // Panel: đổi vai trò / scopes
  const [roleUser, setRoleUser] = useState<UserData | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  // Panel: xác nhận xoá
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const authHeaders = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json" }),
    [],
  );

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        headers: authHeaders(),
        credentials: "include",
      });
      const json: ApiResponse = await res.json().catch(() => null);
      if (res.ok && json?.status === "success" && Array.isArray(json.data)) {
        setUsers((json.data as Record<string, unknown>[]).map(toUserData));
      } else {
        const msg = `Tải danh sách thất bại (HTTP ${res.status}): ${json?.message ?? res.statusText}`;
        logger.warn("Fetch users failed:", msg);
        setFetchError(
          res.status === 401
            ? "Hết phiên đăng nhập — đăng nhập lại rồi tải lại trang."
            : res.status === 403
              ? "Tài khoản không có quyền admin."
              : msg,
        );
      }
    } catch (err) {
      logger.error("Error fetching users:", err);
      setFetchError("Không kết nối được API — kiểm tra API có đang chạy không.");
    } finally {
      setUsersLoading(false);
    }
  }, [authHeaders]);

  const patchUser = useCallback(
    async (value: UserEditValue) => {
      if (!editingUser) return;
      if (value.password && value.password.length < 8) {
        alert("Mật khẩu mới tối thiểu 8 ký tự.");
        return;
      }
      setSavingEdit(true);
      try {
        const body: Record<string, string> = {};
        if (value.name.trim()) body.userName = value.name.trim();
        if (value.email.trim()) body.email = value.email.trim();
        if (value.password) body.password = value.password;
        const res = await fetch(
          `${API_BASE_URL}/users/${editingUser.user_code}`,
          {
            method: "PUT",
            headers: authHeaders(),
            credentials: "include",
            body: JSON.stringify(body),
          },
        );
        const json = await res.json();
        if (res.ok) {
          setEditingUser(null);
          await fetchUsers();
        } else {
          alert(
            `Thất bại: ${json.detail ?? json.message ?? "Lỗi không xác định"}`,
          );
        }
      } catch (err) {
        logger.error("Error patching user:", err);
        alert("Lỗi kết nối khi sửa thông tin");
      } finally {
        setSavingEdit(false);
      }
    },
    [authHeaders, editingUser, fetchUsers],
  );

  const createUser = useCallback(
    async (value: UserAddValue) => {
      if (!value.name.trim() || value.password.length < 8) return;
      setSavingAdd(true);
      try {
        const res = await fetch(`${API_BASE_URL}/users`, {
          method: "POST",
          headers: authHeaders(),
          credentials: "include",
          body: JSON.stringify({
            userName: value.name.trim(),
            password: value.password,
            role: value.role,
            scopes: value.role === "operator" ? value.scopes : undefined,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          setShowAdd(false);
          await fetchUsers();
        } else {
          alert(`Tạo thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error creating user:", err);
        alert("Lỗi kết nối khi tạo người dùng");
      } finally {
        setSavingAdd(false);
      }
    },
    [authHeaders, fetchUsers],
  );

  const saveRole = useCallback(
    async (value: UserRoleValue) => {
      if (!roleUser) return;
      if (value.role === "operator" && value.scopes.length === 0) {
        alert("Chọn ít nhất 1 scope cho operator");
        return;
      }
      setSavingRole(true);
      try {
        const resRole = await fetch(
          `${API_BASE_URL}/users/${encodeURIComponent(roleUser.user_code)}`,
          {
            method: "PUT",
            headers: authHeaders(),
            credentials: "include",
            body: JSON.stringify({ role: value.role }),
          },
        );
        const jsonRole = await resRole.json();
        if (!resRole.ok) {
          alert(`Đổi vai trò thất bại: ${jsonRole.message ?? "Lỗi"}`);
          return;
        }
        if (value.role === "operator") {
          const resScopes = await fetch(
            `${API_BASE_URL}/users/${encodeURIComponent(roleUser.user_code)}/operator`,
            {
              method: "PUT",
              headers: authHeaders(),
              credentials: "include",
              body: JSON.stringify({ scopes: value.scopes }),
            },
          );
          const jsonScopes = await resScopes.json();
          if (!resScopes.ok) {
            alert(`Cấp scope thất bại: ${jsonScopes.message ?? "Lỗi"}`);
            return;
          }
        }
        setRoleUser(null);
        await fetchUsers();
      } catch (err) {
        logger.error("Error updating role:", err);
        alert("Lỗi kết nối khi đổi vai trò");
      } finally {
        setSavingRole(false);
      }
    },
    [roleUser, authHeaders, fetchUsers],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setSavingDelete(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/${encodeURIComponent(deleteTarget.user_code)}`,
        { method: "DELETE", headers: authHeaders(), credentials: "include" },
      );
      const json = await res.json();
      if (res.ok) {
        setDeleteTarget(null);
        await fetchUsers();
      } else {
        alert(`Xoá thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error deleting user:", err);
      alert("Lỗi kết nối khi xoá người dùng");
    } finally {
      setSavingDelete(false);
    }
  }, [deleteTarget, authHeaders, fetchUsers]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <UserEditPanel
        item={editingUser}
        saving={savingEdit}
        onClose={() => setEditingUser(null)}
        onSave={patchUser}
      />
      <UserAddPanel
        open={showAdd}
        saving={savingAdd}
        onClose={() => setShowAdd(false)}
        onCreate={createUser}
      />
      <UserRolePanel
        item={roleUser}
        saving={savingRole}
        onClose={() => setRoleUser(null)}
        onSave={saveRole}
      />
      <UserDeletePanel
        item={deleteTarget}
        saving={savingDelete}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
            <Users size={20} /> Người dùng
          </h1>
          <FilterSelect
            value={userRoleFilter}
            onChange={setUserRoleFilter}
            aria-label="Lọc theo vai trò"
          >
            <option value="all">Tất cả</option>
            <option value="operator">Operator</option>
            <option value="player">Thí sinh</option>
            <option value="spectator">Khán giả</option>
          </FilterSelect>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            onClick={() => setShowAdd(true)}
            className="gap-1.5 bg-primary hover:bg-primary/90 text-sm font-medium"
          >
            <Plus size={15} /> Thêm người dùng
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void fetchUsers()}
            disabled={usersLoading}
            className="bg-accent/50 border border-border hover:bg-accent disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw
              size={16}
              className={usersLoading ? "animate-spin" : ""}
            />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        {fetchError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
            <p className="text-destructive text-sm mb-3">{fetchError}</p>
            <Button
              variant="destructive"
              onClick={() => void fetchUsers()}
              className="bg-destructive hover:bg-destructive/90 text-foreground text-sm font-medium"
            >
              Thử lại
            </Button>
          </div>
        ) : usersLoading && users.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Đang tải…</p>
        ) : users.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground text-sm">Không có người dùng nào trong DB.</p>
            <p className="text-muted-foreground/70 text-xs mt-1">
              Tài khoản admin đăng nhập bằng env (ADMIN_USERNAME) không nằm trong DB —
              bấm “Thêm người dùng” để tạo user đầu tiên.
            </p>
          </div>
        ) : (
          <Table className="w-full text-sm">
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Mã người dùng</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Tên người dùng</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Email</TableHead>
                <TableHead className="py-2 px-2 font-medium text-muted-foreground">Vai trò</TableHead>
                <TableHead className="py-2 px-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users
                .filter(
                  (u: UserData) =>
                    userRoleFilter === "all" || u.role === userRoleFilter,
                )
                .slice()
                .reverse()
                .map((u: UserData) => (
                  <TableRow
                    key={u.user_code}
                    className="border-b border-border/50 hover:bg-accent/50"
                  >
                    <TableCell className="py-2 px-2 font-mono text-xs text-foreground/80">
                      {u.user_code}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-foreground">{u.user_name}</TableCell>
                    <TableCell className="py-2 px-2 text-xs text-muted-foreground">
                      {u.email ?? (
                        <span className="text-muted-foreground/70 italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2">
                      <span className="capitalize text-foreground/90">{u.role}</span>
                      {u.role === "operator" && u.operator_scopes && (
                        <span className="block text-[11px] text-muted-foreground font-mono">
                          {u.operator_scopes}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 px-2 text-right">
                      <UserRowActions
                        onEdit={() => setEditingUser(u)}
                        onChangeRole={() => setRoleUser(u)}
                        onDelete={() => setDeleteTarget(u)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default AdminUsersPage;
