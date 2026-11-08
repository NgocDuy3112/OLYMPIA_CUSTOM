import { Camera, CameraOff, Mic, MicOff } from "lucide-react";
import { useSelfCam, type RtcStatus } from "@shared/lib/rtc";


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
            className="mx-auto mt-3 flex w-full max-w-sm flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2 text-left font-sans shadow-sm"
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

            <p className="max-w-56 font-sans text-[0.7rem] leading-snug text-muted-foreground">
                Hình và tiếng chỉ phát trong phòng của trận này.{" "}
                <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Chính sách quyền riêng tư
                </a>
            </p>
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

