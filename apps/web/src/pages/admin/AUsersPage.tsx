import { useCallback, useEffect, useState } from "react";
import { Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("AUsersPage");

type GlobalRole = "admin" | "operator" | "player" | "spectator";
type OperatorScope = "question_creator" | "controller" | "mc" | "referee";

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

const OPERATOR_SCOPES: OperatorScope[] = [
  "question_creator",
  "controller",
  "mc",
  "referee",
];

const AUsersPage = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  const deleteUser = useCallback(
    async (userCode: string, userName: string) => {
      const confirmed = window.confirm(
        `Bạn có chắc muốn xoá thí sinh "${userName}" (${userCode})?\nHành động này không thể hoàn tác.`,
      );
      if (!confirmed) return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/users/${encodeURIComponent(userCode)}`,
          { method: "DELETE", headers: authHeaders() },
        );
        const json = await res.json();
        if (res.ok) {
          await fetchUsers();
        } else {
          alert(
            `Xoá thất bại: ${json.detail ?? json.message ?? "Lỗi không xác định"}`,
          );
        }
      } catch (err) {
        logger.error("Error deleting user:", err);
        alert("Lỗi kết nối khi xoá thí sinh");
      }
    },
    [authHeaders, fetchUsers],
  );

  const grantOperator = useCallback(
    async (userCode: string) => {
      const input = window.prompt(
        `Cấp operator cho ${userCode}.\nNhập scopes (phân cách dấu phẩy): question_creator, controller, mc, referee`,
        "controller,mc",
      );
      if (input === null) return;
      const scopes = input
        .split(",")
        .map((s) => s.trim())
        .filter((s) => OPERATOR_SCOPES.includes(s as OperatorScope));
      if (scopes.length === 0) {
        alert("Scopes không hợp lệ");
        return;
      }
      try {
        const res = await fetch(
          `${API_BASE_URL}/users/${encodeURIComponent(userCode)}/operator`,
          {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ scopes }),
          },
        );
        const json = await res.json();
        if (res.ok) {
          await fetchUsers();
        } else {
          alert(
            `Cấp quyền thất bại: ${json.detail ?? json.message ?? "Lỗi không xác định"}`,
          );
        }
      } catch (err) {
        logger.error("Error granting operator:", err);
        alert("Lỗi kết nối khi cấp quyền");
      }
    },
    [authHeaders, fetchUsers],
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4 lg:p-6 min-h-screen text-white">
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-blue-950 border border-blue-600 rounded-xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-blue-200">
                Sửa thông tin thí sinh
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1 rounded hover:bg-blue-800 transition-colors"
              >
                ✕
              </button>
            </div>
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
          </div>
        </div>
      )}

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
                            onClick={() => void grantOperator(u.user_code)}
                            className="p-1.5 rounded bg-amber-600/70 hover:bg-amber-500 transition-colors"
                            title="Cấp operator (question_creator, controller, mc, referee)"
                          >
                            <Users size={13} />
                          </button>
                          <button
                            onClick={() => void deleteUser(u.user_code, u.user_name)}
                            className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
                            title="Xoá thí sinh"
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

export default AUsersPage;
