import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import type { QuestionAnswerRow, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"
import { turnChipHint, turnChipsOf } from "@shared/deck/ve-dich-board"

export type VeDichChungCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
    rows: QuestionAnswerRow[]
}

export function VeDichChungAOCController({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, rows } = ctx
    const projection = v.projection

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
    if (openNow) {
        if (revealed) {
            // The clock is a budget, not a stopwatch: once it started the engine
            // refuses a second start (ALREADY_OPEN), expired or not.
            if (!counting && consoleVeDich?.clockStarted !== true) {
                startClock = () => ctx.send({ kind: "ve-dich.startClock" })
            }
        }
    }
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
    // The controller opens any staged question at will — there is no "Câu tiếp".
    // Leaving an open question is refused while it may still be costing someone
    // plays: a running clock has contestants who have not submitted yet (they
    // are absent from `rows`), and anyone who did submit must be graded first.
    const submitted = rows.length > 0
    const settled = submitted && !unjudged
    const untouched = !submitted && !counting && !consoleVeDich?.clockStarted
    const canSwitch = !openNow || settled || untouched

    // The console only lights a "selected" card while a question is being
    // judged, and the chung screen never is — so stamp the ticked card's ring
    // here, otherwise clicking a card would never show.
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
                                return {
                                    id: chip.questionId,
                                    label: String(chip.value),
                                    active: isOpen,
                                    // The open chip re-reveals; the others switch (guarded).
                                    clickable: isOpen ? !revealed : canSwitch,
                                    title: turnChipHint(chip.where, chip.value),
                                }
                            })}
                            onSelect={(id: string) => {
                                const actions: LiveAction[] = []
                                if (openNow === null || id !== openNow.questionId) {
                                    // Moving on: close the open question first, or the
                                    // engine refuses (a revealed/clocked one is locked).
                                    if (openNow !== null) actions.push({ kind: "ve-dich.closeQuestion" })
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
