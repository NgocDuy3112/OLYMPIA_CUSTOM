import { useEffect, useRef } from "react"
import type { LocalVideoTrack } from "livekit-client"
import { useSelfCam } from "@shared/lib/rtc"
import { initialsOf, pt } from "./geometry"
import { railCardClass, railCardState, railScoreClass } from "./rail-card"
import { RailAnswerLine } from "./rail-answer"
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

const cardRing = (mine: boolean, activeRun: boolean): string => {
    if (mine) return "ring-2 ring-sky-500"
    if (activeRun) return "ring-2 ring-amber-400"
    return ""
}

export function Rail({ view, myId, currentQid }: {
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const scoreFontSize = 34
    const selfCam = useSelfCam()
    const answerRowFor = (userId: string, qid: string | null | undefined) => {
        if (!qid) return undefined
        return view.publicVerdicts?.find((row) => row.questionId === qid && row.userId === userId)
    }
    return (
        <>
            {view.table.slice(0, 4).map((row) => {
                const mine = myId !== null && row.id === myId
                const state = railCardState({
                    buzzing: view.me.buzzer === row.id,
                })
                const activeRun = view.oral?.playerId === row.id
                const buzzed = view.me.buzzer === row.id
                let revealedAnswer: string | null = null
                let revealedMs: number | null = null
                if (view.revealed) {
                    const entry = view.revealed.contestants.find((c) => c.userId === row.id)
                    if (entry) {
                        revealedAnswer = entry.answer
                        const keywordQ = view.keyword?.questionId ?? null
                        if (currentQid !== keywordQ) revealedMs = entry.answeredMs ?? null
                    }
                }

                const answerRow = answerRowFor(row.id, currentQid)
                let answeredMs = answerRow?.answeredMs ?? null
                if (revealedMs !== null) answeredMs = revealedMs
                let buzzMs: number | null = null
                if (buzzed) {
                    const ms = view.me.buzzerMs
                    if (ms !== null) {
                        if (ms !== undefined) buzzMs = ms
                    }
                }
                let rowTitle: string | undefined = undefined
                if (mine) rowTitle = "Bạn"
                const rowHeight = "h-[9.3cqw]"
                return (
                    <div
                        key={row.id}
                        title={rowTitle}
                        className={`flex ${rowHeight} shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] shadow-sm ${railCardClass(state)} ${cardRing(mine, activeRun)}`}
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
                                <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(scoreFontSize) }}>
                                    {row.points}
                                </span>
                                <RailAnswerLine
                                    answer={revealedAnswer}
                                    answeredMs={answeredMs}
                                    buzzLabel={buzzed ? "Đã bấm chuông" : null}
                                    buzzMs={buzzed ? buzzMs : null}
                                />
                            </div>
                        </div>
                    </div>
                )
            })}
        </>
    )
}
