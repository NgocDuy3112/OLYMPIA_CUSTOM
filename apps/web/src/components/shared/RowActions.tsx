import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RowActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
  children?: ReactNode;
}

export function RowActions({
  onEdit,
  onDelete,
  editTitle = "Sửa",
  deleteTitle = "Xoá",
  children,
}: RowActionsProps) {
  return (
    <div className="flex gap-1 justify-end">
      {onEdit && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onEdit}
          title={editTitle}
        >
          <Pencil size={13} />
        </Button>
      )}
      {children}
      {onDelete && (
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDelete}
          title={deleteTitle}
          className="bg-destructive/70 text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground"
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  );
}

export default RowActions;
