import React from "react";
import { Wifi, WifiOff } from "lucide-react";

interface ConnectionStatusProps {
  isConnected: boolean;
  showLabel?: boolean;
  className?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  showLabel = true,
  className = "",
}) => (
  <div
    role="status"
    aria-live="polite"
    title={isConnected ? "Đã kết nối" : "Mất kết nối"}
    className={`flex items-center gap-1.5 text-xs font-medium ${
      isConnected ? "text-success" : "text-destructive"
    } ${className}`}
  >
    {isConnected ? <Wifi size={14} aria-hidden /> : <WifiOff size={14} aria-hidden />}
    {showLabel && (
      <span className="hidden sm:inline">
        {isConnected ? "Đã kết nối" : "Mất kết nối"}
      </span>
    )}
  </div>
);
