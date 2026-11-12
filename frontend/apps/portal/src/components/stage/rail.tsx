import { useEffect, useRef } from "react"
import type { RemoteVideoTrack } from "livekit-client"
import { pt } from "@shared/deck/geometry"
import { railCardClass, railCardState, railScoreClass } from "@shared/deck/rail-card"

export interface CardData {
    id: string
    name: string
    points: number
    answer?: string        
    value?: string         
    verdict?: "CORRECT" | "INCORRECT" | null
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

const cardRing = (ring: CardData["ring"]): string =>
    ring === "selected" ? "ring-2 ring-primary" : ring === "active" ? "ring-2 ring-amber-400" : ""

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
    const Interactive = onSelect ? "button" : "div"
    return (
        <>
            {cards.map((c) => {
                const state = railCardState({
                    verdict: c.verdict ?? null,
                    locked: c.dimmed === true,
                    buzzing: c.buzzing === true
                })
                const badgeNode = c.badge ? (
                    <span className={badgePill(c.badge.tone)} style={{ fontSize: pt(9) }}>{c.badge.text}</span>
                ) : null
                // the same slot the player card uses for its verdict line — and the
                // same rule: nothing to say means nothing shown (no "—" placeholder)
                const hasAnswer = typeof c.answer === "string" && c.answer !== "" && c.answer !== "—"
                const statusLine = isAnswers ? (
                    hasAnswer || c.badge ? (
                        <span
                            className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-sans leading-none text-foreground/85"
                            style={{ fontSize: pt(12) }}
                            title={c.answer}
                        >
                            {hasAnswer && <span className="truncate">{c.answer}</span>}
                            {!c.badge && typeof c.value === "string" && c.value !== "" && c.value !== "—" && (
                                <span className={`shrink-0 font-semibold tabular-nums ${railScoreClass(state)}`}>
                                    · {c.value}
                                </span>
                            )}
                            {badgeNode}
                        </span>
                    ) : null
                ) : badgeNode ? (
                    <span className="flex shrink-0 items-center justify-center">{badgeNode}</span>
                ) : null
                return (
                <Interactive
                    key={c.id}
                    {...(onSelect ? { type: "button" as const, onClick: () => onSelect(c.id) } : {})}
                    className={`flex ${isAnswers ? "h-[11.9cqw]" : "h-[9.3cqw]"} w-full shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] text-left shadow-sm ${railCardClass(state)} ${
                        onSelect ? "cursor-pointer hover:ring-sky-400" : ""
                    } ${cardRing(c.ring)}`}
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
                            <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(isAnswers ? 44 : 34) }}>
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
