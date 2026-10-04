import React, { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { ApiError, apiCall } from "@/api/client";
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
import { notifyError } from "@/lib/notify";

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
      const json = await apiCall<Record<string, unknown>[]>(
        "/users",
        { headers: authHeaders() },
      );
      if (Array.isArray(json.data)) {
        setUsers((json.data as Record<string, unknown>[]).map(toUserData));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = `Tải danh sách thất bại (HTTP ${err.status}): ${err.message}`;
        logger.warn("Fetch users failed:", msg);
        setFetchError(
          err.status === 401
            ? "Hết phiên đăng nhập — đăng nhập lại rồi tải lại trang."
            : err.status === 403
              ? "Tài khoản không có quyền admin."
              : msg,
        );
      } else {
        logger.error("Error fetching users:", err);
        setFetchError(
          "Không kết nối được API — kiểm tra API có đang chạy không.",
        );
      }
    } finally {
      setUsersLoading(false);
    }
  }, [authHeaders]);

  const patchUser = useCallback(
    async (value: UserEditValue) => {
      if (!editingUser) return;
      if (value.password && value.password.length < 8) {
        notifyError("Mật khẩu mới tối thiểu 8 ký tự.");
        return;
      }
      setSavingEdit(true);
      try {
        const body: Record<string, string> = {};
        if (value.name.trim()) body.userName = value.name.trim();
        if (value.email.trim()) body.email = value.email.trim();
        if (value.password) body.password = value.password;
        await apiCall(`/users/${editingUser.user_code}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setEditingUser(null);
        await fetchUsers();
      } catch (err) {
        if (err instanceof ApiError) {
          notifyError(`Thất bại: ${err.message}`);
        } else {
          logger.error("Error patching user:", err);
          notifyError("Lỗi kết nối khi sửa thông tin");
        }
      } finally {
        setSavingEdit(false);
      }
    },
    [editingUser, fetchUsers],
  );

  const createUser = useCallback(
    async (value: UserAddValue) => {
      if (!value.name.trim() || value.password.length < 8) return;
      setSavingAdd(true);
      try {
        const payload = {
          userName: value.name.trim(),
          password: value.password,
          role: value.role,
          scopes: value.role === "operator" ? value.scopes : undefined,
        };
        await apiCall("/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setShowAdd(false);
        await fetchUsers();
      } catch (err) {
        if (err instanceof ApiError) {
          notifyError(`Tạo thất bại: ${err.message}`);
        } else {
          logger.error("Error creating user:", err);
          notifyError("Lỗi kết nối khi tạo người dùng");
        }
      } finally {
        setSavingAdd(false);
      }
    },
    [fetchUsers],
  );

  const saveRole = useCallback(
    async (value: UserRoleValue) => {
      if (!roleUser) return;
      if (value.role === "operator" && value.scopes.length === 0) {
        notifyError("Chọn ít nhất 1 scope cho operator");
        return;
      }
      setSavingRole(true);
      try {
        try {
          await apiCall(`/users/${encodeURIComponent(roleUser.user_code)}`, {
            method: "PUT",
            body: JSON.stringify({ role: value.role }),
          });
        } catch (err) {
          if (err instanceof ApiError) {
            notifyError(`Đổi vai trò thất bại: ${err.message}`);
            return;
          }
          throw err;
        }
        if (value.role === "operator") {
          try {
            await apiCall(
              `/users/${encodeURIComponent(roleUser.user_code)}/operator`,
              {
                method: "PUT",
                body: JSON.stringify({ scopes: value.scopes }),
              },
            );
          } catch (err) {
            if (err instanceof ApiError) {
              notifyError(`Cấp scope thất bại: ${err.message}`);
              return;
            }
            throw err;
          }
        }
        setRoleUser(null);
        await fetchUsers();
      } catch (err) {
        logger.error("Error updating role:", err);
        notifyError("Lỗi kết nối khi đổi vai trò");
      } finally {
        setSavingRole(false);
      }
    },
    [roleUser, fetchUsers],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setSavingDelete(true);
    try {
      await apiCall(`/users/${encodeURIComponent(deleteTarget.user_code)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      setDeleteTarget(null);
      await fetchUsers();
    } catch (err) {
      if (err instanceof ApiError) {
        notifyError(`Xoá thất bại: ${err.message}`);
      } else {
        logger.error("Error deleting user:", err);
        notifyError("Lỗi kết nối khi xoá người dùng");
      }
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
