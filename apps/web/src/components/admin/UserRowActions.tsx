import { ShieldCheck } from "lucide-react";
import { RowActions } from "@/components/shared/RowActions";

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
    <RowActions onEdit={onEdit} onDelete={onDelete}>
      <button
        onClick={onChangeRole}
        className="p-1.5 rounded bg-amber-600/70 hover:bg-amber-500 transition-colors"
        title="Đổi vai trò / cấp scope"
      >
        <ShieldCheck size={13} />
      </button>
    </RowActions>
  );
}

export default UserRowActions;
