import { useState } from "react"
import { ConsoleStage, QuestionCard, Rail, Timer, ValueCells } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"

import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

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



    let openPicks: (() => void) | undefined = undefined
    if (pickedThisTurn && consoleVeDich?.pendingQuestionId != null) {
        const pendingId = consoleVeDich.pendingQuestionId
        openPicks = () => ctx.send({ kind: "ve-dich.openQuestion", questionId: pendingId })
    }




    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={(id) => ctx.send({ kind: "ve-dich.setTurn", playerId: id })} />}
            actions={[
                {
                    label: "Xác nhận",
                    onClick: openPicks,
                },
                {
                    label: "Chọn lại",
                    onClick: () => ctx.send({ kind: "ve-dich.advanceTurn" }),
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={<Timer remaining={null} />}
            >
                <ValueCells
                    cells={[20, 30, 40, 50].map((value) => ({
                        value,
                        remaining: (projection.board ?? []).filter(
                            (c) => c.value === value && c.where === "free" && !chosen.includes(c.questionId),
                        ).length,
                        chosen: chosen.filter(
                            (id) => (projection.board ?? []).find((c) => c.questionId === id)?.value === value,
                        ).length,
                    }))}
                    onPick={picking ? pickRandomOf : undefined}
                />
            </QuestionCard>
        </ConsoleStage>
    )
}

