import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";

const logger = createLogger("AdminUsersPage");

type GlobalRole = "admin" | "operator" | "player" | "spectator";
type OperatorScope = "qauthor" | "controller" | "mc";

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

const OPERATOR_SCOPES: OperatorScope[] = ["qauthor", "controller", "mc"];

const AdminUsersPage = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Popup: thêm user
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addRole, setAddRole] = useState<GlobalRole>("player");
  const [addScopes, setAddScopes] = useState<OperatorScope[]>([]);
  const [savingAdd, setSavingAdd] = useState(false);

  // Popup: đổi vai trò / scopes
  const [roleUser, setRoleUser] = useState<UserData | null>(null);
  const [roleValue, setRoleValue] = useState<GlobalRole>("player");
  const [roleScopes, setRoleScopes] = useState<OperatorScope[]>([]);
  const [savingRole, setSavingRole] = useState(false);

  // Popup: xác nhận xoá
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);

  const toggleScope = (
    list: OperatorScope[],
    scope: OperatorScope,
  ): OperatorScope[] =>
    list.includes(scope) ? list.filter((s) => s !== scope) : [...list, scope];

  const authHeaders = useCallback(
    (): HeadersInit => ({ "Content-Type": "application/json" }),
    [],
  );

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users/`, {
        headers: authHeaders(),
      });
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setUsers(json.data as unknown as UserData[]);
      } else {
        logger.warn("Fetch users failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching users:", err);
    } finally {
      setUsersLoading(false);
    }
  }, [authHeaders]);

  const patchUser = useCallback(async () => {
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const body: Record<string, string | null> = {};
      if (editName.trim()) body.user_name = editName.trim();
      body.email = editEmail.trim() || null;
      const res = await fetch(
        `${API_BASE_URL}/users/${editingUser.user_code}`,
        {
          method: "PATCH",
          headers: authHeaders(),
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
  }, [authHeaders, editingUser, editName, editEmail, fetchUsers]);

  const createUser = useCallback(async () => {
    if (!addName.trim() || !addEmail.trim()) return;
    setSavingAdd(true);
    try {
      const res = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          userName: addName.trim(),
          email: addEmail.trim(),
          password: addPassword,
          role: addRole,
          scopes: addRole === "operator" ? addScopes : undefined,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setShowAdd(false);
        setAddName("");
        setAddEmail("");
        setAddPassword("");
        setAddRole("player");
        setAddScopes([]);
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
  }, [addName, addEmail, addPassword, addRole, addScopes, authHeaders, fetchUsers]);

  const saveRole = useCallback(async () => {
    if (!roleUser) return;
    setSavingRole(true);
    try {
      const resRole = await fetch(
        `${API_BASE_URL}/users/${encodeURIComponent(roleUser.user_code)}`,
        {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify({ role: roleValue }),
        },
      );
      const jsonRole = await resRole.json();
      if (!resRole.ok) {
        alert(`Đổi vai trò thất bại: ${jsonRole.message ?? "Lỗi"}`);
        return;
      }
      if (roleValue === "operator") {
        if (roleScopes.length === 0) {
          alert("Chọn ít nhất 1 scope cho operator");
          return;
        }
        const resScopes = await fetch(
          `${API_BASE_URL}/users/${encodeURIComponent(roleUser.user_code)}/operator`,
          {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ scopes: roleScopes }),
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
  }, [roleUser, roleValue, roleScopes, authHeaders, fetchUsers]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setSavingDelete(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/users/${encodeURIComponent(deleteTarget.user_code)}`,
        { method: "DELETE", headers: authHeaders() },
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
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white">
      <SidePanel
        open={editingUser !== null}
        onClose={() => setEditingUser(null)}
        title="Sửa thông tin thí sinh"
      >
        {editingUser && (
          <>
            <p className="text-xs text-blue-400 font-mono -mt-2">
              Mã: {editingUser.user_code}
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Tên thí sinh</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={() => void patchUser()}
                disabled={savingEdit || !editName.trim()}
                className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {savingEdit ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </>
        )}
      </SidePanel>

      <SidePanel
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Thêm người dùng"
      >
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Tên người dùng</label>
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Email</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Mật khẩu</label>
                <input
                  type="password"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Tối thiểu 8 ký tự"
                  minLength={8}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Vai trò</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as GlobalRole)}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
                >
                  <option value="player">Thí sinh (player)</option>
                  <option value="spectator">Khán giả (spectator)</option>
                  <option value="operator">Điều phối (operator)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {addRole === "operator" && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-blue-300">
                    Scopes (chọn 1+)
                  </label>
                  <div className="flex gap-3 text-sm text-blue-100">
                    {OPERATOR_SCOPES.map((s) => (
                      <label key={s} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={addScopes.includes(s)}
                          onChange={() =>
                            setAddScopes((prev) => toggleScope(prev, s))
                          }
                          className="accent-blue-500"
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={() => void createUser()}
                disabled={
                  savingAdd ||
                  !addName.trim() ||
                  !addEmail.trim() ||
                  addPassword.length < 8 ||
                  (addRole === "operator" && addScopes.length === 0)
                }
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {savingAdd ? "Đang tạo…" : "Tạo người dùng"}
              </button>
            </div>
      </SidePanel>

      <SidePanel
        open={roleUser !== null}
        onClose={() => setRoleUser(null)}
        title="Đổi vai trò"
      >
        {roleUser && (
          <>
            <p className="text-xs text-blue-400 font-mono -mt-2">
              {roleUser.user_name} · {roleUser.user_code}
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-blue-300">Vai trò</label>
              <select
                value={roleValue}
                onChange={(e) => setRoleValue(e.target.value as GlobalRole)}
                className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm"
              >
                <option value="player">Thí sinh (player)</option>
                <option value="spectator">Khán giả (spectator)</option>
                <option value="operator">Điều phối (operator)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {roleValue === "operator" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Scopes</label>
                <div className="flex gap-3 text-sm text-blue-100">
                  {OPERATOR_SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={roleScopes.includes(s)}
                        onChange={() =>
                          setRoleScopes((prev) => toggleScope(prev, s))
                        }
                        className="accent-blue-500"
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setRoleUser(null)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={() => void saveRole()}
                disabled={
                  savingRole ||
                  (roleValue === "operator" && roleScopes.length === 0)
                }
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {savingRole ? "Đang lưu…" : "Lưu"}
              </button>
            </div>
          </>
        )}
      </SidePanel>

      <SidePanel
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Xoá người dùng?"
        tone="danger"
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-blue-200">
              <span className="font-mono">{deleteTarget.user_code}</span> ·{" "}
              {deleteTarget.user_name}
              <br />
              <span className="text-xs text-blue-400">
                Hành động này không thể hoàn tác.
              </span>
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={() => void confirmDelete()}
                disabled={savingDelete}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {savingDelete ? "Đang xoá…" : "Xoá"}
              </button>
            </div>
          </>
        )}
      </SidePanel>

      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
              <Users size={20} /> Người dùng
            </h2>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="px-2 py-1 rounded bg-blue-950 border border-blue-700 text-blue-200 text-xs"
            >
              <option value="all">Tất cả</option>
              <option value="admin">Admin</option>
              <option value="operator">Operator</option>
              <option value="player">Thí sinh</option>
              <option value="spectator">Khán giả</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Plus size={15} /> Thêm người dùng
            </button>
            <button
              onClick={() => void fetchUsers()}
              disabled={usersLoading}
              className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
              title="Làm mới"
            >
              <RefreshCw
                size={16}
                className={usersLoading ? "animate-spin" : ""}
              />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 -mr-2 pr-2">
          {usersLoading && users.length === 0 ? (
            <p className="text-gray-400 text-sm">Đang tải…</p>
          ) : users.length === 0 ? (
            <p className="text-gray-400 text-sm">Không có người dùng nào.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-blue-900">
                <tr className="text-left text-blue-300 border-b border-blue-700">
                  <th className="py-2 px-2">Mã người dùng</th>
                  <th className="py-2 px-2">Tên người dùng</th>
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Vai trò</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter(
                    (u: UserData) =>
                      userRoleFilter === "all" || u.role === userRoleFilter,
                  )
                  .slice()
                  .reverse()
                  .map((u: UserData) => (
                    <tr
                      key={u.user_code}
                      className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors"
                    >
                      <td className="py-2 px-2 font-mono text-xs">
                        {u.user_code}
                      </td>
                      <td className="py-2 px-2">{u.user_name}</td>
                      <td className="py-2 px-2 text-xs text-blue-300">
                        {u.email ?? (
                          <span className="text-gray-500 italic">—</span>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <span className="capitalize">{u.role}</span>
                        {u.role === "operator" && u.operator_scopes && (
                          <span className="block text-[11px] text-blue-300 font-mono">
                            {u.operator_scopes}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              setEditingUser(u);
                              setEditName(u.user_name);
                              setEditEmail(u.email ?? "");
                            }}
                            className="p-1.5 rounded bg-white-600/70 hover:bg-white-500 transition-colors"
                            title="Sửa thông tin"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setRoleUser(u);
                              setRoleValue(u.role);
                              setRoleScopes(
                                (u.operator_scopes ?? "")
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter((s): s is OperatorScope =>
                                    OPERATOR_SCOPES.includes(s as OperatorScope),
                                  ),
                              );
                            }}
                            className="p-1.5 rounded bg-amber-600/70 hover:bg-amber-500 transition-colors"
                            title="Đổi vai trò / cấp scope"
                          >
                            <ShieldCheck size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
                            title="Xoá người dùng"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminUsersPage;
