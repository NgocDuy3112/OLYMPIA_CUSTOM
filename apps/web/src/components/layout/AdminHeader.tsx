import React from "react";
import { ShellHeader } from "./ShellHeader";

interface AdminHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

/** Wrapper — logic thật nằm ở ShellHeader (dùng chung với Controller/QAuthor). */
export const AdminHeader: React.FC<AdminHeaderProps> = (props) => (
  <ShellHeader roleLabel="Admin" {...props} />
);
