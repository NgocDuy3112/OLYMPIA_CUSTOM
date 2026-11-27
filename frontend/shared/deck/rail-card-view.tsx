import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client"
import { initialsOf, pt } from "./geometry"
import { PlayerCamControls } from "./player-cam-controls"
import { RailAnswerLine } from "./rail-answer"
import { railCardClass, railScoreClass, railSelfRingClass, type RailCardState } from "./rail-card"
import { TurnIcon, type TurnIconKind } from "./turn-icon"
import { useScoreFlash } from "./score-flash"
import { VerdictFlashLayer } from "./verdict-flash"

export interface RailCardData {
    id: string
    name: string
    points: number
    state: RailCardState
    mine?: boolean
    answer?: string | null
    answeredMs?: number | null
    buzzLabel?: string | null
    buzzMs?: number | null
    value?: string
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }
    icon?: TurnIconKind
    video?: RemoteVideoTrack | null
    selfVideo?: LocalVideoTrack | null
    selfControls?: ReactNode
    onToggleAudio?: () => void
    onToggleVideo?: () => void
    onToggleMic?: () => void
    micOn?: boolean
    audioMuted?: boolean
    videoHidden?: boolean
}

interface PlayerCardProps {
    card: RailCardData
    onSelect?: (id: string) => void
    onScoreClick?: (id: string) => void
    selectHint?: boolean
    title?: string
}

const PILL_TONE: Record<NonNullable<RailCardData["badge"]>["tone"], string> = {
    primary: "bg-primary text-primary-foreground",
    amber: "bg-chart-4/15 text-chart-4 ring-1 ring-chart-4/30",
    emerald: "bg-chart-3/15 text-chart-3 ring-1 ring-chart-3/30",
}

function badgePill(tone: NonNullable<RailCardData["badge"]>["tone"]): string {
    return "flex items-center justify-center rounded-full px-[0.6cqw] font-sans font-semibold leading-tight " + PILL_TONE[tone]
}

function VideoLayer({ track }: { track: RemoteVideoTrack | LocalVideoTrack }) {
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

function ScoreVerdict({ points, scoreSize, onFlash }: { points: number; scoreSize: number; onFlash: (flashing: boolean) => void }) {
    const flash = useScoreFlash(points)
    const flashing = flash !== null
    useEffect(() => {
        onFlash(flashing)
    }, [flashing, onFlash])
    return <VerdictFlashLayer flash={flash} points={points} size={scoreSize} />
}

function Badge({ card }: { card: RailCardData }) {
    if (!card.badge) return null
    return <span className={badgePill(card.badge.tone)} style={{ fontSize: pt(9) }}>{card.badge.text}</span>
}

function Icon({ card }: { card: RailCardData }) {
    if (!card.icon) return null
    return <TurnIcon kind={card.icon} />
}

function ValueLine({ card, state }: { card: RailCardData; state: RailCardState }) {
    if (card.badge) return null
    if (typeof card.value !== "string") return null
    if (card.value === "") return null
    if (card.value === "—") return null
    return (
        <span className={`font-semibold tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(12) }}>
            {card.value}
        </span>
    )
}

function hasControls(card: RailCardData): boolean {
    if (card.onToggleAudio) return true
    if (card.onToggleVideo) return true
    if (card.onToggleMic) return true
    if (card.selfControls) return true
    return false
}

function statusVisible(card: RailCardData): boolean {
    if (card.answer) return true
    if (card.badge) return true
    if (card.icon) return true
    if (card.buzzLabel) return true
    if (card.answeredMs !== null && card.answeredMs !== undefined) return true
    return false
}

function Score({ card, state, onScoreClick }: { card: RailCardData; state: RailCardState; onScoreClick?: (id: string) => void }) {
    const scoreSize = 34
    if (!onScoreClick) {
        return (
            <span className={`font-display font-bold leading-none tabular-nums ${railScoreClass(state)}`} style={{ fontSize: pt(scoreSize) }}>
                {card.points}
            </span>
        )
    }
    return (
        <button
            type="button"
            onClick={() => onScoreClick(card.id)}
            title="Sửa điểm câu trả lời"
            className={`cursor-pointer font-display font-bold leading-none tabular-nums transition hover:underline ${railScoreClass(state)}`}
            style={{ fontSize: pt(scoreSize) }}
        >
            {card.points}
        </button>
    )
}

function Avatar({ card }: { card: RailCardData }) {
    let videoNode: ReactNode = null
    if (card.video) videoNode = <VideoLayer track={card.video} />
    if (card.selfVideo) videoNode = <VideoLayer track={card.selfVideo} />
    return (
        <div
            className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-primary/10 font-display font-bold text-primary/70"
            style={{ fontSize: pt(16) }}
        >
            <span aria-hidden>{initialsOf(card.name)}</span>
            {videoNode}
            {card.selfControls}
            {hasControls(card) && (
                <PlayerCamControls
                    playerId={card.id}
                    micOn={card.micOn}
                    audioMuted={card.audioMuted}
                    videoOff={card.videoHidden}
                    onToggleMic={card.onToggleMic}
                    onToggleAudio={card.onToggleAudio}
                    onToggleVideo={card.onToggleVideo}
                />
            )}
        </div>
    )
}

export function PlayerCard({ card, onSelect, onScoreClick, selectHint, title }: PlayerCardProps) {
    const state = card.state
    const [flashing, setFlashing] = useState(false)
    const onFlash = useCallback((next: boolean) => setFlashing(next), [])
    let Tag: "button" | "div" = "div"
    let interactiveProps: Record<string, unknown> | undefined = undefined
    let hoverCls = ""

    if (onSelect) {
        const selected = card.state === "picked"
        const nestedButton = hasControls(card) || Boolean(onScoreClick)
        if (nestedButton) {
            Tag = "div"
            interactiveProps = {
                role: "button",
                tabIndex: 0,
                onClick: () => onSelect(card.id),
                onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key !== "Enter") return
                    onSelect(card.id)
                },
                "aria-pressed": selected,
            }
        } else {
            Tag = "button"
            interactiveProps = {
                type: "button",
                onClick: () => onSelect(card.id),
                "aria-pressed": selected,
            }
        }
        hoverCls = "cursor-pointer hover:ring-chart-1 active:ring-chart-1"
        if (selected) hoverCls = "cursor-pointer"
        if (selectHint) hoverCls = "cursor-pointer hover:ring-chart-3 active:ring-chart-3"
    }

    let statusNode: ReactNode = null
    if (statusVisible(card)) {
        statusNode = (
            <div className="flex min-w-0 flex-col items-center justify-center gap-[0.3cqw] font-sans leading-none text-foreground/85">
                <Icon card={card} />
                <RailAnswerLine answer={card.answer ?? null} answeredMs={card.answeredMs ?? null} buzzLabel={card.buzzLabel ?? null} buzzMs={card.buzzMs ?? null} />
                <ValueLine card={card} state={state} />
                <Badge card={card} />
            </div>
        )
    }

    const ringCls = railSelfRingClass(card.mine === true)

    return (
        <Tag
            {...(interactiveProps ?? {})}
            title={title}
            className={`flex h-[9.3cqw] shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl p-[0.9cqw] text-left shadow-sm ${railCardClass(state)} ${hoverCls} ${ringCls}`}
        >
            <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                <Avatar card={card} />
                <div className="relative flex min-w-0 min-h-0 flex-1 flex-col justify-start gap-[0.3cqw] overflow-hidden pt-[0.2cqw] text-center">
                    <div className={flashing ? "contents-faded flex min-h-0 flex-1 flex-col items-center justify-start gap-[0.3cqw]" : "flex min-h-0 flex-1 flex-col items-center justify-start gap-[0.3cqw]"}>
                        <span className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-display font-semibold leading-none text-foreground" style={{ fontSize: pt(16) }}>
                            <span className="truncate">{card.name}</span>
                        </span>
                        <Score card={card} state={state} onScoreClick={onScoreClick} />
                        {statusNode}
                    </div>
                    <ScoreVerdict points={card.points} scoreSize={34} onFlash={onFlash} />
                </div>
            </div>
        </Tag>
    )
}
