import { createContext, useContext } from "react"
import { Camera, CameraOff, Circle, Mic, MicOff, Square } from "lucide-react"
import { Button } from "@shared/ui/button"
import type { HostBroadcast } from "@shared/lib/rtc"
import { useRecording, useStartRecording, useStopRecording } from "@/lib/recording"


export interface ConsoleHost {
    tournamentId: string
    matchId: string
    host: HostBroadcast
}

/** The controller's screen owns these; the action strip picks them up from here. */
export const ConsoleHostContext = createContext<ConsoleHost | null>(null)

// The Ghi hình toggle (manual override of the auto-LIVE recording) and the host's
// camera/mic. Camera/mic styling mirrors the player deck's own controls on the
// camera view so both surfaces read as one system.
export function ConsoleControls({ tournamentId, matchId, host }: ConsoleHost) {
    const recording = useRecording(tournamentId, matchId)
    const start = useStartRecording(tournamentId, matchId)
    const stop = useStopRecording(tournamentId, matchId)

    const active = recording.data?.items.find((row) => row.status === "RECORDING") ?? null
    const busy = start.isPending || stop.isPending

    const mutationError = start.error ?? stop.error
    const errorText =
        host.mediaError ??
        (mutationError instanceof Error
            ? mutationError.message
            : mutationError
              ? String(mutationError)
              : null)

    const camBtnCls = (on: boolean) =>
        `flex size-7 items-center justify-center rounded-lg ring-1 transition disabled:opacity-40 ${
            on
                ? "bg-background text-foreground ring-border hover:bg-muted"
                : "bg-destructive/10 text-destructive ring-destructive/30 hover:bg-destructive/20"
        }`

    return (
        <>
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur">
                <Button
                    type="button"
                    size="sm"
                    variant={active ? "destructive" : "outline"}
                    disabled={busy}
                    aria-pressed={active !== null}
                    onClick={() => (active ? stop.mutate() : start.mutate())}
                    className="h-7 gap-1.5 px-2 text-xs"
                >
                    {active ? (
                        <>
                            <Square className="size-3 fill-current" aria-hidden />
                            Dừng ghi
                        </>
                    ) : (
                        <>
                            <Circle className="size-3 fill-current text-destructive" aria-hidden />
                            Ghi hình
                        </>
                    )}
                </Button>

                <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />

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

/**
 * The controls sitting at the END of the controller's action strip, beside the
 * round buttons — the host comes from ConsoleHostContext.
 */
export function StripControls() {
    const host = useContext(ConsoleHostContext)
    if (!host) return null
    return (
        <div className="flex shrink-0 flex-col gap-1 font-sans">
            <ConsoleControls {...host} />
        </div>
    )
}

// Floating copy for the waiting room, which has no action strip.
export function ConsoleToolbar({ tournamentId, matchId, host }: ConsoleHost) {
    return (
        <div
            role="region"
            aria-label="Điều khiển ghi hình"
            className="absolute right-2 top-2 z-30 flex flex-col items-end gap-1.5 font-sans"
        >
            <ConsoleControls tournamentId={tournamentId} matchId={matchId} host={host} />
        </div>
    )
}
