import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer, VeDichPickBoard } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"

export type VeDichChungPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    setSelectedPlayer: (userId: string) => void
}

function sameIds(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false
    return a.every((id) => b.includes(id))
}

export function VeDichChungPickAOCController({ ctx }: { ctx: VeDichChungPickCtx }) {
    const { v, baseCards, flash } = ctx
    const projection = v.projection

    // rules.md §7.4: phase 1 stages one open question per player — the server
    // counts the same way (VeDichTurn.ConfirmPicks wants Players.Count picks).
    const need = projection.table.length
    const pendingIds = (projection.board ?? [])
        .filter((c) => c.where === "pending")
        .map((c) => c.questionId)
    const pendingKey = pendingIds.join(",")
    const [chosen, setChosen] = useState<string[]>(pendingIds)
    const [seenPending, setSeenPending] = useState(pendingKey)
    if (seenPending !== pendingKey) {
        setSeenPending(pendingKey)
        setChosen(pendingIds)
    }
    // A refused pick leaves the local batch ahead of the server, and the pending key
    // never moves because the server never took the pick. A failed action is the only
    // thing that raises `flash`, and the view it carries is the last server truth — so
    // fold the local batch back onto it instead of keeping a pick that does not exist.
    if (flash !== null && !sameIds(chosen, pendingIds)) setChosen(pendingIds)

    const boardCells = projection.board ?? []
    const stagedCells: Array<{ questionId: string; value: number }> = []
    for (const id of chosen) {
        const cell = boardCells.find((c) => c.questionId === id)
        if (cell) stagedCells.push({ questionId: cell.questionId, value: cell.value })
    }

    const togglePick = (questionId: string) => {
        if (chosen.includes(questionId)) {
            const next = chosen.filter((picked) => picked !== questionId)
            setChosen(next)
            ctx.send({ kind: "ve-dich.pickRound", questionIds: next })
            return
        }
        if (chosen.length >= need) return
        const next = [...chosen, questionId]
        setChosen(next)
        ctx.send({ kind: "ve-dich.pickRound", questionIds: next })
    }

    const full = need > 0 && chosen.length >= need
    // Xác nhận locks the whole batch server-side, so it also waits for the server to
    // hold exactly that batch: VeDichTurn.ConfirmPicks refuses any count but Players.Count.
    const ready = full && pendingIds.length === need

    return (
        <ConsoleStage
            // Phase 1 has no per-player turn — the batch is shared, so a rail click has
            // no server action behind it and must not offer one.
            rail={<Rail cards={baseCards} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: "Xác nhận",
                    onClick: ready
                        ? () => ctx.send({ kind: "ve-dich.confirmPicks" })
                        : undefined,
                },
                {
                    label: "Chọn lại",
                    onClick: chosen.length > 0
                        ? () => {
                            setChosen([])
                            ctx.send({ kind: "ve-dich.clearPicks" })
                        }
                        : undefined,
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
                            chips={stagedCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: true,
                                // A staged pick is not on stage yet — only the open question breathes.
                                live: false,
                                clickable: true,
                                title: `Bỏ câu ${cell.value} điểm`,
                            }))}
                            onSelect={(id: string) => togglePick(id)}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <VeDichPickBoard cells={boardCells} pickedIds={chosen} full={full} onPick={togglePick} />
            </QuestionCard>
        </ConsoleStage>
    )
}
