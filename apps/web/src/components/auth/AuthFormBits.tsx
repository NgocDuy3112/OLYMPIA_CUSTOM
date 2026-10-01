import React from "react";
import { AlertCircle } from "lucide-react";

/**
 * Class input thống nhất cho các trang auth (login player/staff).
 * - h-11 = 44px touch target
 * - placeholder:text-muted-foreground (trước: gray-400 hardcode)
 */
export const authInputClass =
  "h-11 px-4 rounded-lg bg-accent border border-border text-foreground placeholder:text-muted-foreground text-sm focus-visible:border-ring";

/** Lỗi form: role=alert + icon, thay cho dòng text-xs màu đỏ khó thấy. */
export const AuthError: React.FC<{ message: string }> = ({ message }) => (
  <p
    role="alert"
    className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-destructive"
  >
    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
    <span>{message}</span>
  </p>
);
