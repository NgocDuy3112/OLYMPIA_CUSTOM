import { createContext, useContext } from "react"
import { Camera, CameraOff, Mic, MicOff } from "lucide-react"
import type { HostBroadcast } from "@shared/lib/rtc"


export interface ConsoleHost {
    tournamentId: string
    matchId: string
    host: HostBroadcast
}

export const ConsoleHostContext = createContext<ConsoleHost | null>(null)

export function ConsoleControls({ host }: Pick<ConsoleHost, "host">) {
    const errorText = host.mediaError

    const camBtnCls = (on: boolean) =>
        `flex size-7 items-center justify-center rounded-lg ring-1 transition disabled:opacity-40 ${
            on
                ? "bg-background text-foreground ring-border hover:bg-muted"
                : "bg-destructive/10 text-destructive ring-destructive/30 hover:bg-destructive/20"
        }`

    return (
        <>
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur">
                <button
                    type="button"
                    onClick={host.toggleMic}
                    disabled={!host.connected}
                    aria-pressed={host.micOn}
                    aria-label={host.micOn ? "Tắt mic" : "Bật mic"}
                    title={host.micOn ? "Tắt mic" : "Bật mic"}
                    className={camBtnCls(host.micOn)}
                >
                    {host.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                </button>
                <button
                    type="button"
                    onClick={host.toggleCam}
                    disabled={!host.connected}
                    aria-pressed={host.camOn}
                    aria-label={host.camOn ? "Tắt camera" : "Bật camera"}
                    title={host.camOn ? "Tắt camera" : "Bật camera"}
                    className={camBtnCls(host.camOn)}
                >
                    {host.camOn ? (
                        <Camera className="size-4" />
                    ) : (
                        <CameraOff className="size-4" />
                    )}
                </button>
            </div>

            {errorText && (
                <p
                    role="alert"
                    className="max-w-72 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1 text-right text-[0.7rem] leading-snug text-destructive"
                >
                    {errorText}
                </p>
            )}
        </>
    )
}

export function StripControls() {
    const host = useContext(ConsoleHostContext)
    if (!host) return null
    return (
        <div className="flex shrink-0 flex-col gap-1 font-sans">
            <ConsoleControls {...host} />
        </div>
    )
}

export function ConsoleToolbar({ host }: ConsoleHost) {
    return (
        <div
            role="region"
            aria-label="Điều khiển mic và camera"
            className="absolute right-2 top-2 z-30 flex flex-col items-end gap-1.5 font-sans"
        >
            <ConsoleControls host={host} />
        </div>
    )
}
