import { useEffect, useRef, type ReactNode } from "react"
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client"
import { useSelfCam } from "@shared/lib/rtc"
import { pt } from "./geometry"
import type { LobbyData } from "./types"

/**
 * A seat's camera in the PlayerCard's rectangle — same attach discipline as
 * the rails: the track owns the <video>, cleanup detaches it.
 */
function LobbyVideo({ track }: { track: RemoteVideoTrack | LocalVideoTrack }) {
    const holder = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        const box = holder.current
        if (!box) return
        const video = track.attach()
        video.className = "absolute inset-0 h-full w-full object-cover"
        box.append(video)
        return () => {
            track.detach(video)
            video.remove()
        }
    }, [track])
    return <span ref={holder} className="absolute inset-0 overflow-hidden rounded-lg" aria-hidden />
}

export function Lobby({
    data,
    meId,
    mc,
    hint,
}: {
    data: LobbyData
    meId?: string | null
    mc?: {
        canStart: boolean
        busy?: boolean
        onStart: (roundId: string, phase?: 1 | 2) => void
    }
    /** One muted line under the cards (waiting reason). */
    hint?: ReactNode
}) {
    // This surface's own camera (players); the console passes row.video itself.
    const selfCam = useSelfCam()

    return (
        <div className="absolute inset-0 flex flex-col items-center px-[4cqw] pt-[5cqw] text-center">
            <h1 className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: "3cqw" }}>
                {data.title}
            </h1>
            <p className="mt-[1.2cqw] font-sans font-medium leading-none text-muted-foreground" style={{ fontSize: "1.4cqw" }}>
                {data.title} - {data.label}
            </p>

            {/* seats — the PlayerCard (controller standard): avatar rectangle
                with the connected dot and the camera, name + score beside it. */}
            <div className="mt-[3.2cqw] flex flex-wrap items-stretch justify-center gap-[1.2cqw]">
                {data.table.map((row) => {
                    const mine = Boolean(meId) && row.id === meId
                    const connected = data.connected.includes(row.id)
                    const video = row.video ?? (mine && selfCam?.camOn ? selfCam.video : null)
                    return (
                        <div
                            key={row.id}
                            className={`flex h-[9.3cqw] w-[21cqw] shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl bg-card p-[0.9cqw] shadow-sm ring-1 ring-border ${mine ? "ring-2 ring-sky-500" : ""}`}
                        >
                            <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                                <div
                                    className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                                    style={{ fontSize: pt(16) }}
                                    aria-hidden
                                >
                                    {row.displayName.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                                    {video && <LobbyVideo track={video} />}
                                    <span
                                        className={`absolute right-[0.3cqw] top-[0.4cqw] size-[1.2cqw] rounded-full ring-2 ring-card ${connected
                                                ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                                : "bg-muted-foreground/40"
                                            }`}
                                    />
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                                    <span className="truncate font-display font-medium leading-none text-foreground" style={{ fontSize: pt(12) }}>
                                        {row.displayName}
                                    </span>
                                    <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(48) }}>
                                        {row.points}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {hint && (
                <p className="mt-[2cqw] font-sans text-muted-foreground" style={{ fontSize: "1.3cqw" }}>
                    {hint}
                </p>
            )}

            {/* controller: one button per round — ALL reachable: new starts it,
                ● playing re-opens its saved state (round.goTo), ended too (same
                style). The round buttons are also the way BACK into a round —
                the separate "quay lại deck" is gone. */}
            {mc && data.rounds.length > 0 && (
                <div className="mt-[3cqw] flex flex-wrap items-center justify-center gap-[1cqw]">
                    {data.rounds.map((round, i) => {
                        // Entry-level "you are here": a split pair marks only the
                        // phase we're standing in (pending/unknown marks both).
                        const isCurrent =
                            data.roundId === round.id &&
                            (round.phase === undefined ||
                                data.currentPhase === round.phase ||
                                data.currentPhase === null ||
                                data.currentPhase === undefined)
                        const live = data.status === "LIVE" && Boolean(mc.canStart) && !mc.busy
                        const prefix = round.status === "playing" && isCurrent ? "● " : ""
                        return (
                            <button
                                key={`${round.id}:${round.name}:${i}`}
                                type="button"
                                disabled={!live}
                                onClick={() => mc.onStart(round.id, round.phase)}
                                title={
                                    round.status === "ended"
                                        ? `Mở lại vòng ${round.name} — trạng thái đã lưu`
                                        : round.status === "playing"
                                            ? isCurrent
                                                ? `Quay lại vòng ${round.name} — đang dở`
                                                : `Mở lại vòng ${round.name} — trạng thái đã lưu`
                                            : isCurrent
                                                ? data.status === "LIVE"
                                                    ? `Bắt đầu vòng ${round.name}`
                                                    : "Trận chưa mở — bắt đầu ở trang trận"
                                                : `Bắt đầu vòng ${round.name} (nhảy tới)`
                                }
                                className={`rounded-[0.5cqw] px-[1.8cqw] py-[0.8cqw] font-sans font-semibold uppercase leading-none tracking-wide transition ${!live
                                        ? "cursor-default bg-card text-muted-foreground ring-1 ring-border"
                                        : round.status === "ended"
                                            ? "cursor-pointer bg-muted text-foreground ring-1 ring-border hover:ring-primary"
                                            : isCurrent
                                                ? round.status === "playing"
                                                    ? "cursor-pointer bg-sky-50 text-sky-800 ring-2 ring-sky-400 hover:brightness-95"
                                                    : "cursor-pointer bg-primary text-primary-foreground shadow-sm hover:brightness-110"
                                                : round.status === "playing"
                                                    ? "cursor-pointer bg-card text-foreground ring-1 ring-border hover:ring-sky-400"
                                                    : "cursor-pointer bg-card text-foreground ring-1 ring-border hover:ring-primary"
                                    } ${live && mc.busy ? "opacity-60" : ""}`}
                                style={{ fontSize: "1.2cqw" }}
                            >
                                {prefix}
                                {round.name}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default Lobby
