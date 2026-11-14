import { useEffect, useRef } from "react"
import type { LocalVideoTrack } from "livekit-client"
import { formatDurationMs } from "@shared/lib/clock"
import { useSelfCam } from "@shared/lib/rtc"
import { pt } from "./geometry"
import { railCardClass, railCardState, railScoreClass } from "./rail-card"
import { SelfCamControls } from "./cam-controls"
import type { PlayerView } from "./types"

function SelfVideo({ track }: { track: LocalVideoTrack }) {
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

const initialsOf = (name: string): string =>
    name.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"

const cardRing = (mine: boolean, activeRun: boolean): string =>
    mine ? "ring-2 ring-sky-500" : activeRun ? "ring-2 ring-amber-400" : ""

export function Rail({ variant, view, myId, currentQid }: {
    variant: "compact" | "answers"
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const compact = variant === "compact"
    const selfCam = useSelfCam()
    const publicFor = (userId: string, qid: string | null | undefined) =>
        qid
            ? view.publicVerdicts?.find((row) => row.questionId === qid && row.userId === userId)?.verdict
            : undefined
    return (
        <>
            {view.table.slice(0, 4).map((row) => {
                const mine = myId !== null && row.id === myId
                const myVerdict = currentQid ? view.me.verdicts?.[currentQid] : undefined
                const shownVerdict = mine ? myVerdict : publicFor(row.id, currentQid)
                const state = railCardState({
                    verdict: shownVerdict ?? null,
                    buzzing: view.me.buzzer === row.id,
                })
                const activeRun = view.oral?.playerId === row.id
                const buzzed = view.me.buzzer === row.id

                const answerRow = currentQid
                    ? view.publicVerdicts?.find(
                          (r) => r.questionId === currentQid && r.userId === row.id
                      )
                    : undefined
                const answeredMs = answerRow?.answeredMs ?? null
                const buzzMs =
                    buzzed && view.me.buzzerMs !== null && view.me.buzzerMs !== undefined
                        ? view.me.buzzerMs
                        : null
                return (
                    <div
                        key={row.id}
                        title={mine ? "Bạn" : undefined}
                        className={`flex ${compact ? "h-[9.3cqw]" : "h-[11.9cqw]"} shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] shadow-sm ${railCardClass(state)} ${cardRing(mine, activeRun)}`}
                    >
                        <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                            <div
                                className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display font-bold text-primary/70"
                                style={{ fontSize: pt(16) }}
                            >
                                <span aria-hidden>{initialsOf(row.displayName)}</span>
                                {mine && selfCam?.camOn && selfCam.video && <SelfVideo track={selfCam.video} />}
                                {mine && <SelfCamControls />}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                                <span className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-display font-semibold leading-none text-foreground" style={{ fontSize: pt(16) }}>
                                    <span className="truncate">{row.displayName}</span>
                                </span>
                                <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(compact ? 34 : 44) }}>
                                    {row.points}
                                </span>
                                {!compact && (answeredMs !== null || buzzed) && (
                                    <span
                                        className="flex min-w-0 flex-wrap items-center justify-center gap-[0.3cqw] font-sans leading-none text-foreground/85"
                                        style={{ fontSize: pt(11) }}
                                    >
                                        {answeredMs !== null && (
                                            <span className="flex items-center gap-[0.25cqw] whitespace-nowrap">
                                                <span>Answer</span>
                                                <span className="tabular-nums text-muted-foreground">
                                                    {formatDurationMs(answeredMs)}
                                                </span>
                                            </span>
                                        )}
                                        {buzzed && answeredMs !== null && (
                                            <span className="text-muted-foreground">·</span>
                                        )}
                                        {buzzed && (
                                            <span className="flex items-center gap-[0.25cqw] whitespace-nowrap">
                                                <span>Đã bấm chuông</span>
                                                {buzzMs !== null && (
                                                    <span className="tabular-nums text-muted-foreground">
                                                        {formatDurationMs(buzzMs)}
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}
