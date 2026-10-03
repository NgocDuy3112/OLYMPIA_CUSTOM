import React from "react";
import { ShellHeader } from "./ShellHeader";

interface QAuthorHeaderProps {
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const QAuthorHeader: React.FC<QAuthorHeaderProps> = (props) => (
  <ShellHeader roleLabel="Question Author" {...props} />
);
