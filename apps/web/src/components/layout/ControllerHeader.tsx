import React from "react";
import { ShellHeader } from "./ShellHeader";

interface ControllerHeaderProps {
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const ControllerHeader: React.FC<ControllerHeaderProps> = (props) => (
  <ShellHeader roleLabel="Controller" {...props} />
);
