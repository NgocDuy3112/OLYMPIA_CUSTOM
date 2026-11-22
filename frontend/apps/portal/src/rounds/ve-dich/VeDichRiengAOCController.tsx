import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"
import { COPY } from "@shared/deck/copy"
import { stripCellsOf } from "@shared/deck/ve-dich-board"
import { formatDurationMs, timerRemainingOf } from "@shared/lib/clock"

export type VeDichRiengCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichRiengAOCController({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash } = ctx
    const projection = v.projection

    const openNow = projection.open[0] ?? null
    const boardCells = projection.board ?? []
    const stripCells = stripCellsOf(boardCells)
    const revealed = consoleVeDich?.revealed ?? false
    const qid = openNow ? openNow.questionId : ""
    let needsVerdict = true
    if (consoleVeDich?.answererId) needsVerdict = ctx.verdictOf(qid, consoleVeDich.answererId) === null
    let buzzerMissing = false
    if (consoleVeDich?.buzzerId) buzzerMissing = ctx.verdictOf(qid, consoleVeDich.buzzerId) === null
    const turnOpen = needsVerdict || buzzerMissing

    const racing = consoleVeDich?.power === "ASSIGN"
    const canLockBuzz = consoleVeDich?.openStage === "buzz" && consoleVeDich.buzzerId === null

    let counting = false
    if (openNow?.deadlineAt && (remaining ?? 0) > 0) counting = true

    let powerStorable = true
    if (consoleVeDich?.phase !== 2) powerStorable = false
    if (openNow !== null) powerStorable = false
    if (consoleVeDich?.turnPlayerId === null) powerStorable = false
    // One power per turn, re-armed every turn — only an empty set locks it.
    // (An absent field is not "empty": keep the buttons live.)
    const turnPowers = consoleVeDich?.powersLeft
    const hasPower = turnPowers === undefined || turnPowers.length > 0
    if (!hasPower) powerStorable = false
    const [assignArmed, setAssignArmed] = useState(false)
    let armed = assignArmed
    if (!powerStorable) armed = false
    const declarePower = (power: "STAR" | "ASSIGN", targetId?: string) => {
        const playerId = consoleVeDich?.turnPlayerId
        if (!playerId) return
        ctx.send({ kind: "ve-dich.declarePower", playerId, power, targetId })
        setAssignArmed(false)
    }
    let stageStar: (() => void) | undefined
    if (powerStorable) stageStar = () => declarePower("STAR")
    let toggleAssign: (() => void) | undefined
    if (powerStorable) toggleAssign = () => setAssignArmed((was) => !was)
    let starSpent = false
    if (!hasPower) starSpent = true
    let starContent: string | undefined
    if (starSpent) starContent = "đã chốt"

    const railSelect = (id: string) => {
        if (armed) {
            declarePower("ASSIGN", id)
            return
        }
        ctx.toggleSelect(id)
    }

    let startClock: (() => void) | undefined = undefined
    if (openNow) {
        if (revealed) {
            if (consoleVeDich?.openStage === "current") {
                if (!counting) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
            }
        }
    }

    let closeCurrent: (() => void) | undefined = undefined
    if (consoleVeDich?.openStage === "current") {
        if (!racing) {
            let clockDone = false
            if (consoleVeDich.clockStarted) {
                if (!counting) clockDone = true
            }
            if (clockDone) closeCurrent = () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" })
        }
    }
    let clearPicks: (() => void) | undefined = undefined
    if (openNow === null) {
        clearPicks = () => {
            const playerId = consoleVeDich?.turnPlayerId
            if (!playerId) return
            ctx.send({ kind: "ve-dich.pickBatch", playerId, questionIds: [] })
        }
    }
    let lockBuzz: (() => void) | undefined = undefined
    if (canLockBuzz) lockBuzz = () => ctx.send({ kind: "ve-dich.lockBuzz" })
    let buzzText = "—"
    if (consoleVeDich?.buzzerMs != null) buzzText = formatDurationMs(consoleVeDich.buzzerMs)
    let endTurn: (() => void) | undefined = () => ctx.hetLuot()
    if (turnOpen) endTurn = undefined
    const timerRemaining = timerRemainingOf(openNow, remaining)

    let canVerdict = false
    if (openNow !== null) canVerdict = true

    // Mirror the chung screen: clicking a card must show which one is ticked.
    // The console only lights a "selected" card while a question is being
    // judged, and the rieng screen never is — so stamp the ring here. While
    // ASSIGN is armed the click hands the question over instead of ticking.
    let cards = baseCards
    if (ctx.selectedIds.size > 0) {
        cards = baseCards.map((card) => {
            if (!ctx.selectedIds.has(card.id)) return card
            return { ...card, ring: "selected" as const }
        })
    }

    return (
        <ConsoleStage
            rail={<Rail cards={cards} onSelect={railSelect} onScoreClick={ctx.openRegrade} selectHint={armed} />}
            actions={[
                {
                    label: COPY.powerStar,
                    onClick: stageStar,
                    content: starContent,
                    muted: !powerStorable,
                },
                {
                    label: COPY.powerAssign,
                    onClick: toggleAssign,
                    muted: !powerStorable,
                },
                {
                    label: "chọn thẻ để chỉ định",
                    muted: true,
                    empty: !armed,
                },
                {
                    label: "Đếm giờ",
                    onClick: startClock,
                },
                {
                    label: "Mở chuông",
                    onClick: closeCurrent,
                },
                {
                    label: "Khoá chuông",
                    onClick: lockBuzz,
                },
                {
                    label: "Chuông",
                    content: buzzText,
                    muted: true,
                },
                ...verdictActions({
                    canVerdict,
                    onVerdict: ctx.setVerdict,
                }),
                {
                    label: "Chọn lại",
                    onClick: clearPicks,
                },
                { label: COPY.endTurn, onClick: endTurn },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={stripCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: cell.where === "open",
                                clickable: !revealed,
                            }))}
                            onSelect={(id: string) => {
                                const actions: LiveAction[] = []
                                if (openNow === null) {
                                    setAssignArmed(false)
                                    actions.push({ kind: "ve-dich.openQuestion", questionId: id })
                                } else if (id !== openNow.questionId) {
                                    actions.push({ kind: "ve-dich.switchQuestion", questionId: id })
                                }
                                if (!revealed) actions.push({ kind: "ve-dich.reveal" })
                                if (actions.length > 0) void ctx.sendChain(actions)
                            }}
                        />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openNow?.question?.questionText ?? ""}
                media={openNow?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
