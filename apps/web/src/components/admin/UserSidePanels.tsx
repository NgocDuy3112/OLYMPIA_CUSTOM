import { useEffect, useState } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { formInputClass, formLabelClass } from "@/components/shared/ui/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type GlobalRole = "admin" | "operator" | "player" | "spectator";
type OperatorScope = "qauthor" | "controller" | "mc";

const OPERATOR_SCOPES: OperatorScope[] = ["qauthor", "controller", "mc"];

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

const cancelClass =
  "px-4 py-2 rounded-lg bg-accent/50 hover:bg-accent text-sm transition-colors";

const saveClass =
  "px-4 py-2 rounded-lg disabled:opacity-50 font-semibold text-sm transition-colors";

interface UserEditPanelProps {
  item: PanelUser | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: UserEditValue) => void | Promise<void>;
}

export function UserEditSidePanel({ item, saving, onClose, onSave }: UserEditPanelProps) {
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
          <Button variant="ghost" onClick={onClose} className={cancelClass}>
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void onSave({ name, email, password })}
            disabled={saving || !name.trim() || (isStaff && password !== "" && password.length < 8)}
            className={saveClass}
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground ">
        Mã: {item?.user_code}
      </p>
      <div className="flex flex-col gap-1">
        <label className={formLabelClass}>{isStaff ? "Tên người dùng" : "Tên thí sinh"}</label>
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} className={formInputClass} />
      </div>
      {isStaff ? (
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>Mật khẩu mới</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Để trống = giữ nguyên (tối thiểu 8 ký tự)"
            minLength={8}
            className={formInputClass}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>Email</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className={formInputClass}
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

export function UserAddSidePanel({ open, saving, onClose, onCreate }: UserAddPanelProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("qauthor");

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
          <Button
            variant="ghost"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-accent/50 border border-border hover:bg-accent text-sm transition-colors"
          >
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={handleCreate}
            disabled={saving || !name.trim() || password.length < 8}
            className={saveClass}
          >
            {saving ? "Đang tạo…" : "Tạo người dùng"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1">
        <label className={formLabelClass}>Tên người dùng</label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Nguyễn Văn A"
          className={formInputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={formLabelClass}>Mật khẩu</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tối thiểu 8 ký tự"
          minLength={8}
          className={formInputClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className={formLabelClass}>Vai trò</label>
        <NativeSelect
          value={staffRole}
          onChange={(e) => setStaffRole(e.target.value as StaffRole)}
          className="w-full"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
        {staffRole !== "admin" && (
          <p className="text-[11px] text-muted-foreground/70">
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

export function UserRoleSidePanel({ item, saving, onClose, onSave }: UserRolePanelProps) {
  const [role, setRole] = useState<GlobalRole>("player");
  const [scopes, setScopes] = useState<OperatorScope[]>([]);
  const open = item !== null;

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
          <Button variant="ghost" onClick={onClose} className={cancelClass}>
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void onSave({ role, scopes })}
            disabled={saving || (role === "operator" && scopes.length === 0)}
            className={saveClass}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground ">
        {item?.user_name} · {item?.user_code}
      </p>
      <div className="flex flex-col gap-1">
        <label className={formLabelClass}>Vai trò</label>
        <NativeSelect
          value={role}
          onChange={(e) => setRole(e.target.value as GlobalRole)}
          className="w-full"
        >
          <option value="player">Thí sinh (player)</option>
          <option value="spectator">Khán giả (spectator)</option>
          <option value="operator">Điều phối (operator)</option>
          <option value="admin">Admin</option>
        </NativeSelect>
      </div>
      {role === "operator" && (
        <div className="flex flex-col gap-1">
          <label className={formLabelClass}>Scopes</label>
          <div className="flex gap-3 text-sm text-foreground">
            {OPERATOR_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <Checkbox
                  checked={scopes.includes(s)}
                  onCheckedChange={() => setScopes((prev) => toggleScope(prev, s))}
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

export function UserDeleteSidePanel({ item, saving, onClose, onConfirm }: UserDeletePanelProps) {
  const open = item !== null;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Xoá người dùng?"
      tone="danger"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} className={cancelClass}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-destructive hover:bg-destructive/90 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang xoá…" : "Xoá"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-foreground">
        <span className="">{item?.user_code}</span> · {item?.user_name}
        <br />
        <span className="text-xs text-primary">Hành động này không thể hoàn tác.</span>
      </p>
    </SidePanel>
  );
}
