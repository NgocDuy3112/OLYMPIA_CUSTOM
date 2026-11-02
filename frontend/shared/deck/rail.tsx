// The PLAYER's rail — the contestant cards as this player sees them: initials,
// name, score, and (on the judging screens) their own verdict on the open
// question. MY-HIGHLIGHT: my card wears a sky ring; the active oral run amber.
//
// The MC's rail is its own component (portal/components/stage/rail.tsx): the MC
// sees cameras and verdicts, the player sees "BẠN". Same frame, two different
// jobs — sharing the frame but not the card keeps both readable.
import { useEffect, useRef } from "react"
import type { LocalVideoTrack } from "livekit-client"
import { useSelfCam } from "@shared/lib/rtc"
import { pt } from "./geometry"
import { railCardClass, railCardState, railScoreClass } from "./rail-card"
import type { PlayerView } from "./types"

/**
 * My own camera inside MY rail card's rectangle — a LOCAL track attached
 * directly (players never subscribe to anyone). The initials stay underneath
 * as the base; cam-off / not-connected falls back to them naturally.
 */
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

/** The ring a card wears: mine (sky) > the active oral run (amber) > none. */
const cardRing = (mine: boolean, activeRun: boolean): string =>
    mine ? "ring-2 ring-sky-500" : activeRun ? "ring-2 ring-amber-400" : ""

export function Rail({ variant, view, myId, currentQid }: {
    variant: "compact" | "answers"
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const compact = variant === "compact"
    // This player's own broadcast (null outside the match provider — then all
    // cards stay initials, which is exactly right).
    const selfCam = useSelfCam()
    // Rounds that publish their verdicts (khởi động / bứt phá / về đích) hand the
    // deck the whole field's ✓/✗ for the question in play; giai-ma never does.
    const publicFor = (userId: string, qid: string | null | undefined) =>
        qid
            ? view.publicVerdicts?.find((row) => row.questionId === qid && row.userId === userId)?.verdict
            : undefined
    return (
        <>
            {view.table.slice(0, 4).map((row) => {
                const mine = myId !== null && row.id === myId
                const myVerdict = currentQid ? view.me.verdicts?.[currentQid] : undefined
                // …and, when the round publishes, the whole field's verdict.
                const shownVerdict = mine ? myVerdict : publicFor(row.id, currentQid)
                // The card's STATE is the verdict: bright (right), grey (wrong or
                // locked out), purple + dashed white (buzzed first), plain (waiting).
                const state = railCardState({
                    verdict: shownVerdict ?? null,
                    locked: mine && view.me.lockedOut === true,
                    buzzing: view.me.buzzer === row.id,
                })
                const activeRun = view.oral?.playerId === row.id
                return (
                    <div
                        key={row.id}
                        title={mine ? "Bạn" : undefined}
                        className={`flex ${compact ? "h-[9.3cqw]" : "h-[11.9cqw]"} shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] shadow-sm ${railCardClass(state)} ${cardRing(mine, activeRun)}`}
                    >
                        <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                            <div
                                className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                                style={{ fontSize: pt(16) }}
                                aria-hidden
                            >
                                {initialsOf(row.displayName)}
                                {mine && selfCam?.camOn && selfCam.video && <SelfVideo track={selfCam.video} />}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                                <span className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-display font-medium leading-none text-foreground" style={{ fontSize: pt(12) }}>
                                    <span className="truncate">{row.displayName}</span>
                                    {mine && <span className="rounded bg-sky-500 px-[0.3cqw] text-[0.65em] leading-none text-white">BẠN</span>}
                                </span>
                                <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(compact ? 34 : 44) }}>
                                    {row.points}
                                </span>
                            </div>
                        </div>
                        {!compact && (
                            <div className="flex shrink-0 items-center justify-center gap-[0.4cqw] text-center" style={{ fontSize: pt(12) }}>
                                <span className="inline-flex items-center gap-[0.3cqw]">
                                    {state === "waiting" ? "chờ chấm" : state === "correct" ? "đúng" : state === "wrong" ? "chưa đúng" : "đang trả lời"}
                                </span>
                            </div>
                        )}
                    </div>
                )
            })}
        </>
    )
}
