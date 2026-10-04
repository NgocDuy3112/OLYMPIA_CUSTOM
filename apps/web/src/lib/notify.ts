import { toast } from "@/components/ui/toast";

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
