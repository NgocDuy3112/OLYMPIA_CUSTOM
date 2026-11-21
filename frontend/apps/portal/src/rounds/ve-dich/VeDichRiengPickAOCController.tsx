import { useState } from "react"
import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer, ValueCells } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "@/rounds/types"

export type VeDichRiengPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    setSelectedPlayer: (userId: string) => void
}


export function VeDichRiengPickAOCController({ ctx }: { ctx: VeDichRiengPickCtx }) {
    const { consoleVeDich } = ctx
    const projection = ctx.v.projection
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null
    const pendingCount = (projection.board ?? []).filter((c) => c.where === "pending").length
    const stagingKey = `${turnPlayer ?? "-"}:${pendingCount}:${projection.open.length}`
    return <VeDichRiengPickBoard key={stagingKey} ctx={ctx} />
}

function VeDichRiengPickBoard({ ctx }: { ctx: VeDichRiengPickCtx }) {
    const { v, baseCards, flash } = ctx
    const projection = v.projection
    const consoleVeDich = (ctx.v.console ?? null) as VeDichConsole | null
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null


    const [chosen, setChosen] = useState<string[]>(
        () => (projection.board ?? []).filter((c) => c.where === "pending").map((c) => c.questionId),
    )
    const openNow = projection.open[0] ?? null
    const need = 3
    const pickedThisTurn = (consoleVeDich?.turnPicked ?? 0) === need
    const picking = openNow === null && turnPlayer !== null

    const sendPicks = (ids: string[]) => {
        if (!turnPlayer) return
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

    const pickRandomOf = (value: number) => {
        if (!picking || chosen.length >= need) return
        const pool = (projection.board ?? []).filter(
            (c) => c.value === value && c.where === "free" && !chosen.includes(c.questionId),
        )
        if (pool.length === 0) return
        const random = pool[Math.floor(Math.random() * pool.length)]
        const next = [...chosen, random.questionId]
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
                {
                    label: "Sang lượt",
                    onClick: () => ctx.send({ kind: "ve-dich.advanceTurn" }),
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
                <ValueCells
                    cells={[20, 30, 40, 50].map((value) => {
                        const picked = chosen
                        return {
                            value,
                            remaining: (projection.board ?? []).filter(
                                (c) => c.value === value && c.where === "free" && !picked.includes(c.questionId),
                            ).length,
                            chosen: picked.filter((id) => {
                                const cell = (projection.board ?? []).find((c) => c.questionId === id)
                                if (!cell) return false
                                return cell.value === value
                            }).length,
                        }
                    })}
                    onPick={picking ? pickRandomOf : undefined}
                />
            </QuestionCard>
        </ConsoleStage>
    )
}

