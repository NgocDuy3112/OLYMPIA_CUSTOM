import type { ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";

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
        <button
          onClick={onEdit}
          className="p-1.5 rounded bg-white-600/70 hover:bg-white-500 transition-colors"
          title={editTitle}
        >
          <Pencil size={13} />
        </button>
      )}
      {children}
      {onDelete && (
        <button
          onClick={onDelete}
          className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
          title={deleteTitle}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

export default RowActions;
