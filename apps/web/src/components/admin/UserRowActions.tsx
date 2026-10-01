import { ShieldCheck } from "lucide-react";
import { RowActions } from "@/components/shared/RowActions";
import { Button } from "@/components/ui/button";

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
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onChangeRole}
        className="bg-amber-600/70 text-white hover:bg-amber-500 hover:text-white"
        title="Đổi vai trò / cấp scope"
      >
        <ShieldCheck size={13} />
      </Button>
    </RowActions>
  );
}

export default UserRowActions;
