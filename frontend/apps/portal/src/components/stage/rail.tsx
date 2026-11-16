import { useEffect, useRef, type ReactNode } from "react"
import type { RemoteVideoTrack } from "livekit-client"
import { formatDurationMs } from "@shared/lib/clock"
import { pt } from "@shared/deck/geometry"
import { railCardClass, railCardState, railScoreClass } from "@shared/deck/rail-card"

export interface CardData {
    id: string
    name: string
    points: number
    answer?: string        
    answeredMs?: number | null
    value?: string         
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }  
    ring?: "selected" | "active"
    dimmed?: boolean       
    video?: RemoteVideoTrack | null
    buzzing?: boolean
}

const PILL_TONE: Record<NonNullable<CardData["badge"]>["tone"], string> = {
    primary: "bg-primary text-primary-foreground",
    amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-300",
    emerald: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300",
}

const badgePill = (tone: NonNullable<CardData["badge"]>["tone"]): string =>
    `flex items-center justify-center rounded-full px-[0.6cqw] font-sans font-semibold leading-tight ${PILL_TONE[tone]}`

const cardRing = (ring: CardData["ring"]): string => {
    if (ring === "selected") return "ring-2 ring-primary"
    if (ring === "active") return "ring-2 ring-amber-400"
    return ""
}

function CardVideo({ track }: { track: RemoteVideoTrack }) {
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

export function Rail({ variant, cards, onSelect }: { variant: "compact" | "answers"; cards: CardData[]; onSelect?: (id: string) => void }) {
    const isAnswers = variant === "answers"
    let Interactive: "button" | "div" = "div"
    if (onSelect) Interactive = "button"
    let scoreSize = 34
    if (isAnswers) scoreSize = 44
    return (
        <>
            {cards.map((c) => {
                const state = railCardState({
                    locked: c.dimmed === true,
                    buzzing: c.buzzing === true
                })
                let badgeNode: ReactNode = null
                if (c.badge) {
                    badgeNode = <span className={badgePill(c.badge.tone)} style={{ fontSize: pt(9) }}>{c.badge.text}</span>
                }
                const hasAnswer = typeof c.answer === "string" && c.answer !== "" && c.answer !== "—"
                const hasTime = typeof c.answeredMs === "number"
                let showStatus = hasAnswer
                if (c.badge) showStatus = true
                let statusLine: ReactNode = null
                if (showStatus) {
                    statusLine = (
                        <div className="flex min-w-0 flex-col items-center justify-center gap-[0.2cqw] font-sans leading-none text-foreground/85">
                            {hasAnswer && (
                                <span className="w-full truncate text-center" style={{ fontSize: pt(12) }} title={c.answer}>
                                    {c.answer}
                                </span>
                            )}
                            {hasTime && (
                                <span className="tabular-nums text-muted-foreground" style={{ fontSize: pt(8) }}>
                                    {formatDurationMs(c.answeredMs as number)}
                                </span>
                            )}
                            {!c.badge && typeof c.value === "string" && c.value !== "" && c.value !== "—" && (
                                <span className={`font-semibold tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(12) }}>
                                    {c.value}
                                </span>
                            )}
                            {badgeNode}
                        </div>
                    )
                }
                let interactiveProps: { type: "button"; onClick: () => void; "aria-pressed": boolean } | undefined = undefined
                if (onSelect) {
                    interactiveProps = {
                        type: "button",
                        onClick: () => onSelect(c.id),
                        "aria-pressed": c.ring === "selected",
                    }
                }
                let cardHeight = "h-[9.3cqw]"
                if (isAnswers) cardHeight = "h-[11.9cqw]"
                let hoverCls = ""
                if (onSelect) {
                    hoverCls = "cursor-pointer hover:ring-sky-400 active:ring-sky-600"
                    if (c.ring === "selected") hoverCls = "cursor-pointer"
                }
                return (
                <Interactive
                    key={c.id}
                    {...(interactiveProps ?? {})}
                    className={`flex ${cardHeight} w-full shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] text-left shadow-sm ${railCardClass(state)} ${hoverCls} ${cardRing(c.ring)}`}
                >
                    <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                        <div className="relative w-[52%] shrink-0">
                            <div
                                className="flex h-full items-center justify-center rounded-lg bg-primary/10 font-display font-bold text-primary/70"
                                style={{ fontSize: pt(16) }}
                                aria-hidden
                            >
                                {initialsOf(c.name)}
                            </div>
                            {c.video && <CardVideo track={c.video} />}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                            <span className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-display font-semibold leading-none text-foreground" style={{ fontSize: pt(16) }}>
                                <span className="truncate">{c.name}</span>
                            </span>
                            <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(scoreSize) }}>
                                {c.points}
                            </span>
                            {statusLine}
                        </div>
                    </div>
                </Interactive>
                )
            })}
        </>
    )
}
