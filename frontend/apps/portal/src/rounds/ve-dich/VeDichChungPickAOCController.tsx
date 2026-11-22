import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer, ValueCells } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"

export type VeDichChungPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    setSelectedPlayer: (userId: string) => void
}

export function VeDichChungPickAOCController({ ctx }: { ctx: VeDichChungPickCtx }) {
    const { v, baseCards, flash } = ctx
    const projection = v.projection

    const need = Math.max(1, projection.table.length)
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
    const openNow = projection.open[0] ?? null

    const pickRandomOf = (value: number) => {
        if (openNow || chosen.length >= need) return
        const pool = (projection.board ?? []).filter(
            (c) => c.value === value && c.where === "free" && !chosen.includes(c.questionId),
        )
        if (pool.length === 0) return
        const random = pool[Math.floor(Math.random() * pool.length)]
        setChosen([...chosen, random.questionId])
    }

    const boardCells = projection.board ?? []
    const stagedCells: Array<{ questionId: string; value: number }> = []
    for (const id of chosen) {
        const cell = boardCells.find((c) => c.questionId === id)
        if (cell) stagedCells.push({ questionId: cell.questionId, value: cell.value })
    }
    const dropPick = (id: string) => {
        setChosen(chosen.filter((picked) => picked !== id))
    }




    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={ctx.setSelectedPlayer} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: "Xác nhận",
                    onClick: chosen.length >= need
                        ? () => ctx.send({ kind: "ve-dich.pickRound", questionIds: chosen })
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
                                clickable: true,
                                title: `Bỏ câu ${cell.value} điểm`,
                            }))}
                            onSelect={(id: string) => dropPick(id)}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <ValueCells
                    cells={[20, 30].map((value) => ({
                        value,
                        remaining: (projection.board ?? []).filter(
                            (c) => c.value === value && c.where === "free" && !chosen.includes(c.questionId),
                        ).length,
                        chosen: chosen.filter(
                            (id) => (projection.board ?? []).find((c) => c.questionId === id)?.value === value,
                        ).length,
                    }))}
                    onPick={pickRandomOf}
                />
            </QuestionCard>
        </ConsoleStage>
    )
}
