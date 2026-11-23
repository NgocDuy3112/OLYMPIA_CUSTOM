import type { RemoteVideoTrack } from "livekit-client"
import { PlayerCard, type RailCardData } from "@shared/deck/rail-card-view"
import { railCardState } from "@shared/deck/rail-card"

export interface CardData {
    id: string
    name: string
    points: number
    answer?: string
    answeredMs?: number | null
    value?: string
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }
    icon?: "star" | "swords"
    ring?: "selected" | "active"
    dimmed?: boolean
    video?: RemoteVideoTrack | null
    buzzing?: boolean
    micOn?: boolean
    audioMuted?: boolean
    videoHidden?: boolean
    onToggleAudio?: () => void
    onToggleVideo?: () => void
    onToggleMic?: () => void
}

function toCard(c: CardData): RailCardData {
    const keywordSubmitted = c.badge?.text === "TỪ KHOÁ"
    return {
        id: c.id,
        name: c.name,
        points: c.points,
        state: railCardState({
            locked: c.dimmed === true,
            buzzing: c.buzzing === true,
            picked: c.ring === "selected",
            active: c.ring === "active",
            submitted: keywordSubmitted,
        }),
        answer: c.answer ?? null,
        answeredMs: c.answeredMs ?? null,
        value: c.value,
        badge: c.badge,
        icon: c.icon,
        video: c.video ?? null,
        micOn: c.micOn,
        audioMuted: c.audioMuted,
        videoHidden: c.videoHidden,
        onToggleAudio: c.onToggleAudio,
        onToggleVideo: c.onToggleVideo,
        onToggleMic: c.onToggleMic,
    }
}

export function Rail({ cards, onSelect, onScoreClick, selectHint }: {
    cards: CardData[]
    onSelect?: (id: string) => void
    onScoreClick?: (id: string) => void
    selectHint?: boolean
}) {
    let hintTitle: string | undefined = undefined
    if (selectHint) hintTitle = "Bấm thẻ để chỉ định thí sinh"
    return (
        <>
            {cards.map((c) => (
                <PlayerCard
                    key={c.id}
                    card={toCard(c)}
                    onSelect={onSelect}
                    onScoreClick={onScoreClick}
                    selectHint={selectHint}
                    title={hintTitle}
                />
            ))}
        </>
    )
}
