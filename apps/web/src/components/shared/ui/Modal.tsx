import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/shared/ui/Button";
import { cn } from "cn";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  showCloseButton?: boolean;
}

// shadcn DialogContent mặc định `sm:max-w-sm` — size cần override theo sm variant.
const SIZE_STYLES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  showCloseButton = true,
}) => {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(SIZE_STYLES[size])}
        showCloseButton={showCloseButton}
      >
        {title ? (
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
          </DialogHeader>
        ) : (
          <DialogTitle className="sr-only">Thông báo</DialogTitle>
        )}
        <div>{children}</div>
      </DialogContent>
    </Dialog>
  );
};

// Confirmation modal variant
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  variant = "danger",
  isLoading = false,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-muted-foreground mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Đang xử lý..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
