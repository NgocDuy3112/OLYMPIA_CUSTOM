import React, { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import {
  DataTable,
} from "@/components/shared/data-table";
import {
  createDataTableColumns,
  type DataTableColumn,
} from "@/components/shared/data-table-core";
import {
  UserEditSidePanel,
  UserAddSidePanel,
  UserRoleSidePanel,
  UserDeleteSidePanel,
  type GlobalRole,
  type UserEditValue,
  type UserAddValue,
  type UserRoleValue,
} from "@/components/admin/UserSidePanels";
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

  const [showAdd, setShowAdd] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);

  const [roleUser, setRoleUser] = useState<UserData | null>(null);
  const [savingRole, setSavingRole] = useState(false);

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

  const visibleUsers = React.useMemo(
    () =>
      users
        .filter(
          (u: UserData) => userRoleFilter === "all" || u.role === userRoleFilter,
        )
        .slice()
        .reverse(),
    [users, userRoleFilter],
  );

  const columns: DataTableColumn<UserData>[] = React.useMemo(() => {
    const h = createDataTableColumns<UserData>();
    return [
      h.accessor("user_code", {
        header: "Mã người dùng",
        cell: (info) => (
          <span className=" text-xs text-foreground/80">
            {info.getValue()}
          </span>
        ),
      }),
      h.accessor("user_name", {
        header: "Tên người dùng",
        cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
      }),
      h.accessor("email", {
        header: "Email",
        cell: (info) =>
          info.getValue() ? (
            <span className="text-xs text-muted-foreground">{info.getValue()}</span>
          ) : (
            <span className="text-muted-foreground/70 italic">—</span>
          ),
      }),
      h.accessor("role", {
        header: "Vai trò",
        cell: (info) => (
          <span className="capitalize text-foreground/90">{info.getValue()}</span>
        ),
      }),
      h.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: (info) => {
          const u = info.row.original;
          return (
            <span className="flex justify-end">
              <UserRowActions
                onEdit={() => setEditingUser(u)}
                onChangeRole={() => setRoleUser(u)}
                onDelete={() => setDeleteTarget(u)}
              />
            </span>
          );
        },
      }),
    ];
  }, []);

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-foreground">
      <UserEditSidePanel
        item={editingUser}
        saving={savingEdit}
        onClose={() => setEditingUser(null)}
        onSave={patchUser}
      />
      <UserAddSidePanel
        open={showAdd}
        saving={savingAdd}
        onClose={() => setShowAdd(false)}
        onCreate={createUser}
      />
      <UserRoleSidePanel
        item={roleUser}
        saving={savingRole}
        onClose={() => setRoleUser(null)}
        onSave={saveRole}
      />
      <UserDeleteSidePanel
        item={deleteTarget}
        saving={savingDelete}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
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
            className="gap-1.5 text-sm font-medium"
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

      {fetchError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center">
          <p className="text-destructive text-sm mb-3">{fetchError}</p>
          <Button
            variant="destructive"
            onClick={() => void fetchUsers()}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium"
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={visibleUsers}
          loading={usersLoading}
          emptyText="Không có người dùng nào trong DB. Tài khoản admin env (ADMIN_USERNAME) không nằm trong DB — bấm “Thêm người dùng” để tạo user đầu tiên."
          pageSize={20}
        />
      )}
    </div>
  );
};

export default AdminUsersPage;
