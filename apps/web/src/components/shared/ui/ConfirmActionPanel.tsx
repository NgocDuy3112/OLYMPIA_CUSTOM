import { SidePanel } from "@/components/shared/ui/SidePanel";

interface ConfirmActionPanelProps {
  open: boolean;
  title: string;
  tone?: "default" | "danger";
  itemCode?: string;
  message: string;
  note?: string;
  confirmLabel: string;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

/** Panel xác nhận dùng chung cho Thêm/Xoá/Sửa, luôn mở từ sidebar phải. */
export function ConfirmActionPanel({
  open,
  title,
  tone = "default",
  itemCode,
  message,
  note = "Hành động này không thể hoàn tác.",
  confirmLabel,
  saving,
  onClose,
  onConfirm,
}: ConfirmActionPanelProps) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={title}
      tone={tone}
      footer={
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={saving}
            className={`px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
              tone === "danger"
                ? "bg-red-700 hover:bg-red-600"
                : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {saving ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      }
    >
      {itemCode && (
        <p className="text-xs text-blue-400 font-mono -mt-2">{itemCode}</p>
      )}
      <p className="text-sm text-white">{message}</p>
      <p className="text-xs text-gray-400">{note}</p>
    </SidePanel>
  );
}

export default ConfirmActionPanel;
