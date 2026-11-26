import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import { COPY } from "@shared/deck/copy"
import { turnChipHint, turnChipsOf } from "@shared/deck/ve-dich-board"
import { formatDurationMs, timerRemainingOf } from "@shared/lib/clock"
import { capsOf, type VeDichRiengCtx } from "./stage"

export function VeDichPlayRieng({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash } = ctx
    const projection = v.projection
    const caps = capsOf(projection)

    const openNow = projection.open[0] ?? null
    const boardCells = projection.board ?? []
    // The strip keeps all three of the turn's questions visible.
    const turnChips = turnChipsOf({
        turnQuestions: consoleVeDich?.turnQuestions ?? null,
        turnValues: consoleVeDich?.turnValues ?? null,
        board: boardCells,
        openId: openNow?.questionId ?? null,
    })
    const revealed = consoleVeDich?.revealed ?? false
    const qid = openNow ? openNow.questionId : ""
    let needsVerdict = true
    if (consoleVeDich?.answererId) needsVerdict = ctx.verdictOf(qid, consoleVeDich.answererId) === null
    let buzzerMissing = false
    if (consoleVeDich?.buzzerId) buzzerMissing = ctx.verdictOf(qid, consoleVeDich.buzzerId) === null
    const turnOpen = needsVerdict || buzzerMissing

    const [assignArmed, setAssignArmed] = useState(false)
    const armed = assignArmed && caps.canStorePower
    const turnPlayerId = consoleVeDich?.turnPlayerId ?? null
    const pendingQuestionId = consoleVeDich?.pendingQuestionId ?? null
    const turnPowers = consoleVeDich?.powersLeft
    const hasPower = turnPowers === undefined || turnPowers.length > 0
    const declarePower = (power: "STAR" | "ASSIGN" | null, targetId?: string) => {
        const playerId = consoleVeDich?.turnPlayerId
        if (!playerId) return
        ctx.send({ kind: "ve-dich.declarePower", playerId, power, targetId })
        setAssignArmed(false)
    }
    let stageStar: (() => void) | undefined
    if (caps.canStorePower) stageStar = () => declarePower("STAR")
    let toggleAssign: (() => void) | undefined
    if (caps.canStorePower) toggleAssign = () => setAssignArmed((was) => !was)
    let unstagePower: (() => void) | undefined = undefined
    if (caps.canUnstagePower) unstagePower = () => declarePower(null)
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
    if (caps.canStartClock) startClock = () => ctx.send({ kind: "ve-dich.startClock" })

    let closeCurrent: (() => void) | undefined = undefined
    if (caps.canCloseCurrentAnswer) closeCurrent = () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" })
    let clearPicks: (() => void) | undefined = undefined
    if (caps.canOpenQuestion && pendingQuestionId !== null) {
        clearPicks = () => {
            const playerId = consoleVeDich?.turnPlayerId
            if (!playerId) return
            ctx.send({ kind: "ve-dich.pickBatch", playerId, questionIds: [] })
        }
    }
    let lockBuzz: (() => void) | undefined = undefined
    if (caps.canLockBuzz) lockBuzz = () => ctx.send({ kind: "ve-dich.lockBuzz" })
    let buzzText = "—"
    if (consoleVeDich?.buzzerMs != null) buzzText = formatDurationMs(consoleVeDich.buzzerMs)
    let endTurn: (() => void) | undefined = undefined
    if (!turnOpen && caps.canResolve) endTurn = () => ctx.hetLuot()
    const timerRemaining = timerRemainingOf(openNow, remaining)

    // A verdict needs someone to grade: the rail's ticked card, or the screen's
    // target. This screen has no answer rows, so an unticked rail makes
    // setVerdict a silent no-op — keep the buttons inert and ask for the tick.
    let canVerdict = false
    if (openNow !== null) {
        if (ctx.selectedIds.size > 0 || ctx.target !== null) canVerdict = true
    }
    const judgeHint = openNow !== null && !canVerdict

    // Mirror the chung screen: clicking a card must show which one is ticked.
    // The console only lights a "selected" card while a question is being
    // judged, and the rieng screen never is — so stamp the ring here. While
    // ASSIGN is armed the click hands the question over instead of ticking.
    // An armed ASSIGN cannot name the player whose turn it is — the engine
    // rejects it (INVALID_TARGET), so that card leaves the rail while arming.
    let railCards = baseCards
    if (armed && turnPlayerId !== null) {
        railCards = baseCards.filter((card) => card.id !== turnPlayerId)
    }
    let cards = railCards
    if (ctx.selectedIds.size > 0) {
        cards = railCards.map((card) => {
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
                    muted: !caps.canStorePower,
                },
                {
                    label: COPY.powerAssign,
                    onClick: toggleAssign,
                    muted: !caps.canStorePower,
                },
                {
                    label: COPY.powerNone,
                    onClick: unstagePower,
                    empty: unstagePower === undefined,
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
                {
                    label: "chọn thẻ để chấm",
                    muted: true,
                    empty: !judgeHint,
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
                            chips={turnChips.map((chip) => {
                                const isOpen = chip.where === "open"
                                let clickable = false
                                if (isOpen) clickable = caps.canReveal
                                else if (chip.where === "waiting") clickable = caps.canOpenQuestion || caps.canSwitchQuestion
                                return {
                                    id: chip.questionId,
                                    label: String(chip.value),
                                    active: isOpen,
                                    clickable,
                                    title: turnChipHint(chip.where, chip.value),
                                }
                            })}
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
