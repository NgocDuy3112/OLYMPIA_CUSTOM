import { useSelfCam } from "@shared/lib/rtc"
import { SelfCamControls } from "./cam-controls"
import { PlayerCard, type RailCardData } from "./rail-card-view"
import { railCardState } from "./rail-card"
import type { TurnIconKind } from "./turn-icon"
import type { PlayerView } from "./types"

function turnIconFor(view: PlayerView, id: string): TurnIconKind | undefined {
    const staged = view.stagedPower
    if (staged) {
        if (staged.power === "STAR") {
            if (view.turnPlayerId === id) return "star"
        }
        if (staged.power === "ASSIGN") {
            if (view.turnPlayerId === id) return "swords"
        }
        return undefined
    }
    if (view.me.power === "STAR") {
        if (view.answererId === id) return "star"
    }
    if (view.me.power === "ASSIGN") {
        if (view.answererId === id) return "swords"
        if (view.assignedToId === id) return "swords"
    }
    return undefined
}

export function Rail({ view, myId, currentQid }: {
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const selfCam = useSelfCam()

    const cardFor = (row: PlayerView["table"][number]): RailCardData => {
        const mine = myId !== null && row.id === myId
        const isSelected = view.selectedPlayerId === row.id
        const keywordSubmitted = mine && view.me.keywordLocked === true
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

        let answeredMs: number | null = null
        if (currentQid) {
            const answerRow = view.publicVerdicts?.find((r) => r.questionId === currentQid && r.userId === row.id)
            answeredMs = answerRow?.answeredMs ?? null
        }
        if (revealedMs !== null) answeredMs = revealedMs

        let buzzMs: number | null = null
        if (buzzed) {
            const ms = view.me.buzzerMs
            if (ms !== null) {
                if (ms !== undefined) buzzMs = ms
            }
        }

        let selfVideo = null
        let selfControls = undefined
        if (mine) {
            if (selfCam?.camOn && selfCam.video) selfVideo = selfCam.video
            selfControls = <SelfCamControls />
        }

        return {
            id: row.id,
            name: row.displayName,
            points: row.points,
            state: railCardState({
                buzzing: buzzed,
                picked: isSelected,
                submitted: keywordSubmitted,
                active: activeRun,
            }),
            mine,
            answer: revealedAnswer,
            answeredMs,
            buzzLabel: buzzed ? "Đã bấm chuông" : null,
            buzzMs,
            icon: turnIconFor(view, row.id),
            selfVideo,
            selfControls,
        }
    }

    return (
        <>
            {view.table.slice(0, 4).map((row) => (
                <PlayerCard key={row.id} card={cardFor(row)} title={myId === row.id ? "Bạn" : undefined} />
            ))}
        </>
    )
}
