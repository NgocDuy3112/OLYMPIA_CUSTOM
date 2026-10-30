import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { useSelfCam, type RtcStatus } from "@shared/lib/rtc";

/**
 * The player's camera CONTROL bar — status + mic/cam toggles floating over
 * the deck. The FEED itself lives in the player's own Rail card (the
 * `mine` rectangle) via SelfBroadcastContext; this bar never renders video.
 *
 * Visibility is decided by the TOKEN refusal, not by local state:
 *   401/403 — not seated → stay away (the deck's Gate explains)
 *   404     — unknown match → the route shows NotFound
 *   409     — match not LIVE yet → nothing to publish into
 *   503     — rtc not configured on the server → feature is off
 * Everything else (connecting, connected, permission denied…) shows, because
 * the player needs to see WHY their camera isn't up.
 */

const SILENT_STATUSES = new Set([401, 403, 404, 409, 503]);

const STATUS_TEXT: Record<RtcStatus, string> = {
    idle: "",
    connecting: "Đang kết nối camera…",
    connected: "Camera đang bật",
    reconnecting: "Mất kết nối — đang thử lại…",
    disconnected: "Đã ngắt kết nối",
    failed: "Không bật được camera",
};

export function CameraPanel() {
    const self = useSelfCam();

    if (!self) return null;
    if (self.status === "idle") return null;
    if (self.status === "failed" && self.error?.status !== undefined && SILENT_STATUSES.has(self.error.status)) {
        return null;
    }

    const { status, camOn, micOn, mediaError, error, toggleCam, toggleMic } = self;
    const statusText = status === "connected" && !camOn ? "Camera đã tắt" : STATUS_TEXT[status];

    const dotClass =
        status === "connected"
            ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
            : status === "reconnecting" || status === "connecting"
              ? "bg-amber-500 animate-pulse"
              : "bg-muted-foreground/40";

    const btnCls = (on: boolean) =>
        `flex size-7 items-center justify-center rounded-lg ring-1 transition disabled:opacity-40 ${
            on
                ? "bg-background text-foreground ring-border hover:bg-muted"
                : "bg-destructive/10 text-destructive ring-destructive/30 hover:bg-destructive/20"
        }`;

    return (
        <div
            role="region"
            aria-label="Điều khiển camera"
            className="fixed bottom-4 right-4 z-50 overflow-hidden rounded-xl border border-border bg-card px-2 py-1.5 font-sans shadow-xl"
        >
            <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                    <span className="truncate">{statusText}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                    <button
                        type="button"
                        onClick={toggleMic}
                        disabled={status !== "connected"}
                        aria-pressed={micOn}
                        aria-label={micOn ? "Tắt mic" : "Bật mic"}
                        title={micOn ? "Tắt mic" : "Bật mic"}
                        className={btnCls(micOn)}
                    >
                        {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={toggleCam}
                        disabled={status !== "connected"}
                        aria-pressed={camOn}
                        aria-label={camOn ? "Tắt camera" : "Bật camera"}
                        title={camOn ? "Tắt camera" : "Bật camera"}
                        className={btnCls(camOn)}
                    >
                        {camOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
                    </button>
                </span>
            </div>

            {mediaError && (
                <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-snug text-destructive">
                    {mediaError}
                </p>
            )}
            {!mediaError && error && (
                <p className="mt-1.5 border-t border-border pt-1.5 text-xs leading-snug text-destructive">
                    {error.message}
                </p>
            )}
        </div>
    );
}

export default CameraPanel;
