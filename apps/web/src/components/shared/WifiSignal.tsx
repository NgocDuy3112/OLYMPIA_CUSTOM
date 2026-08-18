import React from "react";
import { latencyToBars, latencyToColorClass } from "./wifiSignalHelpers";

interface WifiSignalProps {
  latencyMs: number | null | undefined;

  connected?: boolean;

  size?: number;

  className?: string;
}

const WifiSignal: React.FC<WifiSignalProps> = ({
  latencyMs,
  connected = true,
  size = 16,
  className = "",
}) => {
  const litBars = connected ? latencyToBars(latencyMs) : 0;
  const colorClass = connected
    ? latencyToColorClass(latencyMs)
    : "text-gray-600";

  const bars = [
    { x: 1, h: 4, y: 11 },
    { x: 4, h: 7, y: 8 },
    { x: 7, h: 10, y: 5 },
    { x: 10, h: 13, y: 2 },
  ];

  const tooltip = !connected
    ? "Mất kết nối"
    : latencyMs == null
      ? "Đang đo độ trễ mạng…"
      : `Độ trễ mạng: ${Math.round(latencyMs)}ms`;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${colorClass} ${className}`}
      title={tooltip}
      aria-label={tooltip}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 14 14"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
      >
        {bars.map((bar, i) => {
          const isLit = i < litBars;
          return (
            <rect
              key={bar.x}
              x={bar.x}
              y={bar.y}
              width={2.5}
              height={bar.h}
              rx={0.5}
              className={isLit ? "" : "opacity-25"}
            />
          );
        })}
      </svg>
    </span>
  );
};

export default WifiSignal;
