import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { LiveAction } from "@/lib/live-actions"
import type { QuestionAnswerRow, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"
import { stripCellsOf } from "@shared/deck/ve-dich-board"

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
    const stripCells = stripCellsOf(boardCells)
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
            if (!counting) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
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
    // Switching away from an open question is refused until its answers are
    // all judged, or the plays of the going-away question would be lost.
    let canSwitch = !openNow || !unjudged

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
                            chips={stripCells.map((cell) => {
                                // The open cell always works (it only re-reveals);
                                // other staged cells wait for the open one to be judged.
                                const isOpen = cell.questionId === openNow?.questionId
                                return {
                                    id: cell.questionId,
                                    label: String(cell.value),
                                    active: cell.where === "open",
                                    clickable: (isOpen || canSwitch) && !revealed,
                                }
                            })}
                            onSelect={(id: string) => {
                                const actions: LiveAction[] = []
                                if (openNow === null || id !== openNow.questionId) {
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
