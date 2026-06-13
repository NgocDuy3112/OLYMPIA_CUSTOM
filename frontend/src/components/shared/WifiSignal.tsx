import React from "react";
import { latencyToBars, latencyToColorClass } from "./wifiSignalHelpers";

interface WifiSignalProps {
    /** RTT in ms, or null while a sample is in-flight / no data yet. */
    latencyMs: number | null | undefined;
    /** Whether the player is currently connected. When false the icon greys out. */
    connected?: boolean;
    /** Pixel size for both width and height. Defaults to 16. */
    size?: number;
    /** Optional additional classes. */
    className?: string;
}

/**
 * 4-bar wifi icon whose fill and color reflect the player's RTT to the admin.
 *
 * Each bar is a vertical rounded-rect with progressive height, masked to the
 * pixel grid. Lit bars use the latency color; unlit bars are dim gray.
 */
const WifiSignal: React.FC<WifiSignalProps> = ({
    latencyMs,
    connected = true,
    size = 16,
    className = "",
}) => {
    const litBars = connected ? latencyToBars(latencyMs) : 0;
    const colorClass = connected ? latencyToColorClass(latencyMs) : "text-gray-600";
    // Bar widths/heights (in svg user units) — left bar is tallest so it reads as a wifi icon.
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
