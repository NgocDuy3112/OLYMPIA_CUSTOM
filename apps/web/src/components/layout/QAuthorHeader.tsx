import React from "react";
import { ShellHeader } from "./ShellHeader";

interface QAuthorHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

/** Wrapper — logic thật nằm ở ShellHeader (dùng chung với Admin/Controller). */
export const QAuthorHeader: React.FC<QAuthorHeaderProps> = (props) => (
  <ShellHeader roleLabel="Question Author" {...props} />
);
