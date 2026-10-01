import { SidePanel } from "@/components/shared/ui/SidePanel";
import { Button } from "@/components/ui/button";

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
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            className={
              tone === "danger" ? "" : "bg-success text-success-foreground hover:bg-success/90"
            }
            onClick={() => void onConfirm()}
            disabled={saving}
          >
            {saving ? "Đang xử lý…" : confirmLabel}
          </Button>
        </div>
      }
    >
      {itemCode && (
        <p className="text-xs text-blue-400 font-mono -mt-2">{itemCode}</p>
      )}
      <p className="text-sm text-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </SidePanel>
  );
}

export default ConfirmActionPanel;
