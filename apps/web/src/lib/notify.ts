import { toast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/api/client";

/**
 * Thay các alert() rải rác trong màn trận — shadcn Toast (Base UI).
 * Toaster mount 1 lần ở App.tsx.
 */
export const notifyError = (message: string) =>
  toast.add({
    type: "error",
    title: "Lỗi",
    description: message,
    timeout: 6000,
    priority: "high",
  });

export const notifySuccess = (message: string) =>
  toast.add({ type: "success", title: message, timeout: 4000 });

export const notifyInfo = (message: string) =>
  toast.add({
    type: "info",
    title: "Thông tin",
    description: message,
    timeout: 4500,
  });

export const notifyWarning = (message: string) =>
  toast.add({
    type: "warning",
    title: "Cần chú ý",
    description: message,
    timeout: 6000,
    priority: "high",
  });

/** Bắt lỗi API rồi báo ra toast — thay cho `try/catch` + `json.message` lặp lại. */
export const notifyApiError = (error: unknown, fallback: string) =>
  notifyError(getApiErrorMessage(error, fallback));

/**
 * Báo lỗi API kèm tên thao tác: `Xoá thất bại: <thông điệp server>`.
 * Dùng cho câu gốc dạng `` `${prefix}: ${json.message ?? fallback}` `` để không
 * mất phần ngữ cảnh khi server trả message.
 */
export const notifyApiFailure = (
  error: unknown,
  context: string,
  fallback = "Lỗi không xác định",
) => notifyError(`${context}: ${getApiErrorMessage(error, fallback)}`);
