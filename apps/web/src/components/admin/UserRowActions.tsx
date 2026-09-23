import { Pencil, ShieldCheck, Trash2 } from "lucide-react";

interface UserRowActionsProps {
  onEdit: () => void;
  onChangeRole: () => void;
  onDelete: () => void;
}

/** 3 nút thao tác 1 dòng user: sửa / đổi vai trò / xoá — AdminUsersPage. */
export function UserRowActions({
  onEdit,
  onChangeRole,
  onDelete,
}: UserRowActionsProps) {
  return (
    <div className="flex gap-1 justify-end">
      <button
        onClick={onEdit}
        className="p-1.5 rounded bg-white-600/70 hover:bg-white-500 transition-colors"
        title="Sửa thông tin"
      >
        <Pencil size={13} />
      </button>
      <button
        onClick={onChangeRole}
        className="p-1.5 rounded bg-amber-600/70 hover:bg-amber-500 transition-colors"
        title="Đổi vai trò / cấp scope"
      >
        <ShieldCheck size={13} />
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
        title="Xoá người dùng"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default UserRowActions;
