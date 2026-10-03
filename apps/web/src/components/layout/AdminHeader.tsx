import React from "react";
import { ShellHeader } from "./ShellHeader";

interface AdminHeaderProps {
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = (props) => (
  <ShellHeader roleLabel="Admin" {...props} />
);
