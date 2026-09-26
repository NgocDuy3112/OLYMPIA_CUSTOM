import { useEffect, useState } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";

export type GlobalRole = "admin" | "operator" | "player" | "spectator";
type OperatorScope = "qauthor" | "controller" | "mc";

const OPERATOR_SCOPES: OperatorScope[] = ["qauthor", "controller", "mc"];

/** User tối mínimo — UserData (page) thỏa structural typing. */
interface PanelUser {
  user_code: string;
  user_name: string;
  email: string | null;
  role: GlobalRole;
  operator_scopes?: string | null;
}

export interface UserEditValue {
  name: string;
  email: string;
  /** Mật khẩu mới — chỉ dùng cho admin/operator, rỗng = giữ nguyên. */
  password: string;
}

export interface UserAddValue {
  name: string;
  password: string;
  role: GlobalRole;
  scopes: OperatorScope[];
}

type StaffRole = "admin" | OperatorScope;

const STAFF_ROLES: { value: StaffRole; label: string }[] = [
  { value: "qauthor", label: "QAuthor — soạn câu hỏi" },
  { value: "mc", label: "MC — dẫn trận" },
  { value: "controller", label: "Controller — điều phối live" },
  { value: "admin", label: "Admin — toàn quyền" },
];

export interface UserRoleValue {
  role: GlobalRole;
  scopes: OperatorScope[];
}

const toggleScope = (list: OperatorScope[], scope: OperatorScope): OperatorScope[] =>
  list.includes(scope) ? list.filter((s) => s !== scope) : [...list, scope];

const parseScopes = (raw?: string | null): OperatorScope[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is OperatorScope =>
      OPERATOR_SCOPES.includes(s as OperatorScope),
    );

const inputClass =
  "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

const cancelClass =
  "px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors";

interface UserEditPanelProps {
  item: PanelUser | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: UserEditValue) => void | Promise<void>;
}

/** Panel sửa user — AdminUsersPage.
 *  Staff (admin/operator): Tên + Mật khẩu mới. Player/spectator: Tên + Email. */
export function UserEditPanel({ item, saving, onClose, onSave }: UserEditPanelProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const open = item !== null;
  const isStaff = item?.role === "admin" || item?.role === "operator";

  useEffect(() => {
    if (!open || !item) return;
    setName(item.user_name);
    setEmail(item.email ?? "");
    setPassword("");
  }, [open, item]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={isStaff ? "Sửa thông tin vận hành" : "Sửa thông tin thí sinh"}
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={cancelClass}>
            Huỷ
          </button>
          <button
            onClick={() => void onSave({ name, email, password })}
            disabled={saving || !name.trim() || (isStaff && password !== "" && password.length < 8)}
            className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      }
    >
      <p className="text-xs text-blue-400 font-mono -mt-2">
        Mã: {item?.user_code}
      </p>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-blue-300">{isStaff ? "Tên người dùng" : "Tên thí sinh"}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>
      {isStaff ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Mật khẩu mới</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Để trống = giữ nguyên (tối thiểu 8 ký tự)"
            minLength={8}
            className={inputClass}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className={inputClass}
          />
        </div>
      )}
    </SidePanel>
  );
}

interface UserAddPanelProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (value: UserAddValue) => void | Promise<void>;
}

/** Panel thêm user staff (tên/mật khẩu/vai trò) — AdminUsersPage. */
export function UserAddPanel({ open, saving, onClose, onCreate }: UserAddPanelProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("qauthor");

  // Reset form mỗi lần mở panel.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPassword("");
    setStaffRole("qauthor");
  }, [open ]);

  const handleCreate = () => {
    if (staffRole === "admin") {
      void onCreate({ name, password, role: "admin", scopes: [] });
    } else {
      void onCreate({ name, password, role: "operator", scopes: [staffRole] });
    }
  };

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Thêm người dùng"
      footer={
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !name.trim() || password.length < 8}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang tạo…" : "Tạo người dùng"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Tên người dùng</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Nguyễn Văn A"
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tối thiểu 8 ký tự"
          minLength={8}
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Vai trò</label>
        <select
          value={staffRole}
          onChange={(e) => setStaffRole(e.target.value as StaffRole)}
          className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {staffRole !== "admin" && (
          <p className="text-[11px] text-gray-500">
            Tạo operator với scope {staffRole} — đăng nhập rồi vào đúng shell làm việc.
          </p>
        )}
      </div>
    </SidePanel>
  );
}

interface UserRolePanelProps {
  item: PanelUser | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: UserRoleValue) => void | Promise<void>;
}

/** Panel đổi vai trò + cấp scopes operator — AdminUsersPage. */
export function UserRolePanel({ item, saving, onClose, onSave }: UserRolePanelProps) {
  const [role, setRole] = useState<GlobalRole>("player");
  const [scopes, setScopes] = useState<OperatorScope[]>([]);
  const open = item !== null;

  // Reset từ item mỗi lần mở panel.
  useEffect(() => {
    if (!open || !item) return;
    setRole(item.role);
    setScopes(parseScopes(item.operator_scopes));
  }, [open, item]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Đổi vai trò"
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={cancelClass}>
            Huỷ
          </button>
          <button
            onClick={() => void onSave({ role, scopes })}
            disabled={saving || (role === "operator" && scopes.length === 0)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      }
    >
      <p className="text-xs text-blue-400 font-mono -mt-2">
        {item?.user_name} · {item?.user_code}
      </p>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-blue-300">Vai trò</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as GlobalRole)}
          className={`${inputClass} placeholder-blue-400`}
        >
          <option value="player">Thí sinh (player)</option>
          <option value="spectator">Khán giả (spectator)</option>
          <option value="operator">Điều phối (operator)</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {role === "operator" && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Scopes</label>
          <div className="flex gap-3 text-sm text-blue-100">
            {OPERATOR_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={scopes.includes(s)}
                  onChange={() => setScopes((prev) => toggleScope(prev, s))}
                  className="accent-blue-500"
                />
                {s}
              </label>
            ))}
          </div>
        </div>
      )}
    </SidePanel>
  );
}

interface UserDeletePanelProps {
  item: PanelUser | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/** Panel xác nhận xoá user (tone danger) — AdminUsersPage. */
export function UserDeletePanel({ item, saving, onClose, onConfirm }: UserDeletePanelProps) {
  const open = item !== null;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Xoá người dùng?"
      tone="danger"
      footer={
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className={cancelClass}>
            Huỷ
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang xoá…" : "Xoá"}
          </button>
        </div>
      }
    >
      <p className="text-sm text-blue-200">
        <span className="font-mono">{item?.user_code}</span> · {item?.user_name}
        <br />
        <span className="text-xs text-blue-400">Hành động này không thể hoàn tác.</span>
      </p>
    </SidePanel>
  );
}
