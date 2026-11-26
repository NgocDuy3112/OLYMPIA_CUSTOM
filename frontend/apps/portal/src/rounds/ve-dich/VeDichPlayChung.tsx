import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import { COPY } from "@shared/deck/copy"
import { turnChipHint, turnChipsOf } from "@shared/deck/ve-dich-board"
import { capsOf, type VeDichChungCtx } from "./stage"

export function VeDichPlayChung({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, rows } = ctx
    const projection = v.projection
    const caps = capsOf(projection)

    const openNow = projection.open[0] ?? null
    const boardCells = projection.board ?? []
    // The strip shows every question of the turn (N picks, up to one per player),
    // not just the ones still waiting to be opened.
    const turnChips = turnChipsOf({
        turnQuestions: consoleVeDich?.turnQuestions ?? null,
        turnValues: consoleVeDich?.turnValues ?? null,
        board: boardCells,
        openId: openNow?.questionId ?? null,
    })
    const revealed = consoleVeDich?.revealed ?? false
    const markedIds = () => {
        if (ctx.selectedIds.size > 0) return [...ctx.selectedIds]
        if (ctx.target !== null) return [ctx.target]
        return []
    }

    // Grading is always available: a ticked card earns the points, every other
    // card keeps losing them — no tick means everyone loses.
    const grade = () => {
        const ids = markedIds()
        const actions = projection.table.map((seat) => ({
            kind: "ve-dich.judge" as const,
            playerId: seat.id,
            correct: ids.includes(seat.id),
        }))
        ctx.sendChain(actions)
    }
    const gradeClick: (() => void) | undefined = grade

    let counting = false
    if (openNow?.deadlineAt && (remaining ?? 0) > 0) counting = true
    let startClock: (() => void) | undefined = undefined
    if (caps.canStartClock) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
    let revealAnswer: (() => void) | undefined = undefined
    if (openNow) {
        let clockDone = false
        if (consoleVeDich?.clockStarted) {
            if (!counting) clockDone = true
        }
        if (clockDone) revealAnswer = () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
    }
    let timerRemaining: number | null = null
    if (openNow?.deadlineAt) timerRemaining = remaining

    const unjudged = rows.some((row) => row.verdict === null)
    // Leaving an open question is refused while it may still be costing someone
    // plays: a running clock has contestants who have not submitted yet (they
    // are absent from `rows`), and anyone who did submit must be graded first.
    const submitted = rows.length > 0
    const settled = submitted && !unjudged
    const untouched = !submitted && !counting && !consoleVeDich?.clockStarted
    const canSwitch = caps.canOpenQuestion || settled || untouched

    // Grading only exists while the question is open (VeDichJudge needs it) and
    // answers keep arriving until the clock runs out, so Hết lượt waits for both.
    let endTurn: (() => void) | undefined = undefined
    if (caps.canCloseQuestion && !unjudged && !counting) endTurn = () => ctx.hetLuot()

    // The rail arrives as plain cards: stamp the ticked card's ring here so a
    // click on a card always shows which player it marked (the rieng screen does
    // the same).
    const ticked = markedIds()
    let cards = baseCards
    if (ticked.length > 0) {
        const selected = new Set(ticked)
        cards = baseCards.map((card) => {
            if (!selected.has(card.id)) return card
            return { ...card, ring: "selected" as const }
        })
    }

    return (
        <ConsoleStage
            rail={<Rail cards={cards} onSelect={ctx.toggleSelect} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: "Đếm giờ",
                    onClick: startClock,
                },
                {
                    label: "Hiện trả lời",
                    onClick: revealAnswer,
                },
                {
                    label: "Chấm điểm",
                    onClick: gradeClick,
                },
                { label: COPY.endTurn, onClick: endTurn },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={turnChips.map((chip) => {
                                const isOpen = chip.where === "open"
                                let clickable = false
                                if (isOpen) clickable = caps.canReveal
                                else if (chip.where === "waiting") clickable = canSwitch
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
                                if (openNow === null || id !== openNow.questionId) {
                                    if (caps.canCloseQuestion) {
                                        actions.push({ kind: "ve-dich.closeQuestion" })
                                    }
                                    actions.push({ kind: "ve-dich.openPending", questionId: id })
                                }
                                if (!revealed) actions.push({ kind: "ve-dich.reveal" })
                                if (actions.length > 0) void ctx.sendChain(actions)
                            }}
                        />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openNow !== null && revealed ? openNow.question?.questionText ?? "" : ""}
                media={openNow !== null && revealed ? openNow.question?.media ?? null : null}
            />
        </ConsoleStage>
    )
}
