import React from "react";
import { ShellHeader } from "./ShellHeader";

interface ControllerHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

/** Wrapper — logic thật nằm ở ShellHeader (dùng chung với Admin/QAuthor). */
export const ControllerHeader: React.FC<ControllerHeaderProps> = (props) => (
  <ShellHeader roleLabel="Controller" {...props} />
);
