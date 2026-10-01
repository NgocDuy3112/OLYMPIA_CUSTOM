import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RowActionsProps {
  /** Bỏ prop = không render nút đó. */
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
  /** Nút phụ giữa Sửa và Xoá (Upload, Chốt…). */
  children?: ReactNode;
}

/** Row actions chuẩn cho bảng: Sửa · [nút phụ] · Xoá. */
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
          className="bg-red-700/70 text-white hover:bg-red-600 hover:text-white"
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  );
}

export default RowActions;
