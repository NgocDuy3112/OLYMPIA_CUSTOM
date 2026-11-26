import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import { COPY } from "@shared/deck/copy"
import { turnChipHint, turnChipsOf } from "@shared/deck/ve-dich-board"
import { formatDurationMs, timerRemainingOf } from "@shared/lib/clock"
import type { VeDichRiengCtx } from "./stage"

export function VeDichPlayRieng({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash } = ctx
    const projection = v.projection

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

    const racing = consoleVeDich?.power === "ASSIGN"
    // `openStage` names the window's mode, not that it is running: the engine
    // only takes a lock once the window started (LockBuzzWindow: HasStarted).
    const canLockBuzz = consoleVeDich?.openStage === "buzz" && consoleVeDich.buzzerId === null
        && consoleVeDich.clockStarted === true

    let counting = false
    if (openNow?.deadlineAt && (remaining ?? 0) > 0) counting = true

    // The engine only opens a question that is still pending, and only switches
    // before the window started (Open/SwitchPhase2Question: INVALID_QUESTION,
    // ALREADY_OPEN). A played question can never come back onto the stage.
    const canSwitch = openNow !== null && !revealed
        && consoleVeDich?.clockStarted !== true && consoleVeDich?.buzzerId == null

    let powerStorable = true
    if (consoleVeDich?.phase !== 2) powerStorable = false
    if (openNow !== null) powerStorable = false
    if (consoleVeDich?.turnPlayerId === null) powerStorable = false
    // A power is staged against the turn's remaining picks: with none left the
    // engine refuses every declaration (NOTHING_OPEN).
    const pendingQuestionId = consoleVeDich?.pendingQuestionId ?? null
    if (pendingQuestionId === null) powerStorable = false
    // One power per turn, re-armed every turn — only an empty set locks it.
    // (An absent field is not "empty": keep the buttons live.)
    const turnPowers = consoleVeDich?.powersLeft
    const hasPower = turnPowers === undefined || turnPowers.length > 0
    if (!hasPower) powerStorable = false
    // Staging spends the turn's only power (engine: ONE_POWER_PER_TURN), so a
    // used or already-staged power keeps the buttons inert until it is cancelled.
    const stagedPower = consoleVeDich?.stagedPower ?? null
    if (consoleVeDich?.turnPowerUsed || stagedPower !== null) powerStorable = false
    const [assignArmed, setAssignArmed] = useState(false)
    let armed = assignArmed
    if (!powerStorable) armed = false
    const turnPlayerId = consoleVeDich?.turnPlayerId ?? null
    const declarePower = (power: "STAR" | "ASSIGN" | null, targetId?: string) => {
        const playerId = consoleVeDich?.turnPlayerId
        if (!playerId) return
        ctx.send({ kind: "ve-dich.declarePower", playerId, power, targetId })
        setAssignArmed(false)
    }
    let stageStar: (() => void) | undefined
    if (powerStorable) stageStar = () => declarePower("STAR")
    let toggleAssign: (() => void) | undefined
    if (powerStorable) toggleAssign = () => setAssignArmed((was) => !was)
    // Cancelling hands the turn's power back (engine: DeclarePower(power: null)).
    let unstagePower: (() => void) | undefined = undefined
    if (openNow === null && stagedPower !== null && turnPlayerId !== null && pendingQuestionId !== null) {
        unstagePower = () => declarePower(null)
    }
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
                // The clock is a budget, not a stopwatch: once it started the engine
                // refuses a second start (ALREADY_OPEN), expired or not.
                if (!counting && consoleVeDich.clockStarted !== true) {
                    startClock = () => ctx.send({ kind: "ve-dich.startClock" })
                }
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
    // Clearing an already-empty turn would send an empty batch for nothing; with
    // no pending picks the strip is already back at the pick screen.
    let clearPicks: (() => void) | undefined = undefined
    if (openNow === null && pendingQuestionId !== null) {
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
    // Resolving waits for the oral window to be closed ("Mở chuông" turns it into
    // the buzz window; the engine refuses while it is still oral — ALREADY_OPEN).
    // An ASSIGN duel is deliberately NOT gated on `open.Power`: that flag stays
    // "ASSIGN" for the whole question, and the view carries no "locked" fact, so
    // a race gate here could not tell a locked race from a running one. The
    // engine's RACE_IN_PROGRESS is the guard while the two players are racing;
    // every settled race (locked, buzzed and judged, or timed out) resolves here.
    let endTurn: (() => void) | undefined = () => ctx.hetLuot()
    if (turnOpen || consoleVeDich?.openStage === "current") endTurn = undefined
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
                    muted: !powerStorable,
                },
                {
                    label: COPY.powerAssign,
                    onClick: toggleAssign,
                    muted: !powerStorable,
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
                                if (isOpen) clickable = !revealed
                                else if (chip.where === "waiting") clickable = openNow === null || canSwitch
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
