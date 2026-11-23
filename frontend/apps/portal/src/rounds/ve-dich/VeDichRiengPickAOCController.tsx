import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer, VeDichPickBoard } from "@/components/stage/deck"
import { RIENG_PICK_VALUES } from "@shared/deck/ve-dich-board"
import { backToLobbyAction } from "@/components/stage/actions"
import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"

export type VeDichRiengPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    setSelectedPlayer: (userId: string) => void
}


export function VeDichRiengPickAOCController({ ctx }: { ctx: VeDichRiengPickCtx }) {
    const { v, baseCards, flash } = ctx
    const projection = v.projection
    const consoleVeDich = (ctx.v.console ?? null) as VeDichConsole | null
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null


    const pendingIds = (projection.board ?? [])
        .filter((c) => c.where === "pending")
        .map((c) => c.questionId)
    const pendingKey = `${turnPlayer ?? "-"}:${pendingIds.join(",")}`
    const [chosen, setChosen] = useState<string[]>(pendingIds)
    const [seenPending, setSeenPending] = useState(pendingKey)
    if (seenPending !== pendingKey) {
        setSeenPending(pendingKey)
        setChosen(pendingIds)
    }
    const openNow = projection.open[0] ?? null
    const need = 3
    const pickedThisTurn = (consoleVeDich?.turnPicked ?? 0) === need
    const picking = openNow === null && turnPlayer !== null && (projection.selectedPlayerId ?? null) !== null

    const sendPicks = (ids: string[]) => {
        if (!turnPlayer) return
        if (!picking) return
        ctx.send({ kind: "ve-dich.pickBatch", playerId: turnPlayer, questionIds: ids })
    }

    const boardCells = projection.board ?? []
    const stagedCells: Array<{ questionId: string; value: number }> = []
    for (const id of chosen) {
        const cell = boardCells.find((c) => c.questionId === id)
        if (cell) stagedCells.push({ questionId: cell.questionId, value: cell.value })
    }
    const dropPick = (id: string) => {
        const next = chosen.filter((picked) => picked !== id)
        setChosen(next)
        sendPicks(next)
    }
    let clearPicks: (() => void) | undefined
    if (chosen.length > 0) clearPicks = () => sendPicks([])

    const togglePick = (questionId: string) => {
        if (!picking) return
        if (chosen.includes(questionId)) {
            dropPick(questionId)
            return
        }
        if (chosen.length >= need) return
        const next = [...chosen, questionId]
        setChosen(next)
        sendPicks(next)
    }



    let confirmPicks: (() => void) | undefined = undefined
    if (pickedThisTurn) {
        if (consoleVeDich?.pendingQuestionId != null) {
            confirmPicks = () => ctx.send({ kind: "ve-dich.confirmPicks" })
        }
    }




    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={(id) => ctx.send({ kind: "ve-dich.setTurn", playerId: id })} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: "Xác nhận",
                    onClick: confirmPicks,
                },
                {
                    label: "Chọn lại",
                    onClick: clearPicks,
                },
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
                            chips={stagedCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: true,
                                clickable: picking,
                                title: `Bỏ câu ${cell.value} điểm`,
                            }))}
                            onSelect={(id: string) => dropPick(id)}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <VeDichPickBoard
                    cells={boardCells}
                    pickedIds={chosen}
                    values={RIENG_PICK_VALUES}
                    locked={turnPlayer === null || (projection.selectedPlayerId ?? null) === null}
                    onPick={picking ? togglePick : undefined}
                />
            </QuestionCard>
        </ConsoleStage>
    )
}

