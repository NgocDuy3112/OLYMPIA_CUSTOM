import { PlayerStage, QuestionCard, QuestionChips, Rail, Timer, type PlayerCore } from "../player-deck"
import { ValueCells } from "../value-cells"

type VeDichRiengPickAOCPlayerCtx = PlayerCore



export function VeDichRiengPickAOCPlayer({ ctx }: { ctx: VeDichRiengPickAOCPlayerCtx }) {
    const { v } = ctx
    const pickedIds = v.me.pendingPicks ?? []
    const board = v.board ?? []

    const pickedCells = pickedIds.flatMap((id) => {
        const cell = board.find((c) => c.questionId === id)
        if (!cell) return []
        return [{ id: cell.questionId, value: cell.value }]
    })

    return (
        <PlayerStage
            rail={<Rail view={v} myId={ctx.myId} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={pickedCells.map((cell) => ({
                                id: cell.id,
                                label: String(cell.value),
                                active: true,
                                title: `Câu ${cell.value} điểm đã được chọn`,
                            }))}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <ValueCells
                    cells={[20, 30, 40, 50].map((value) => ({
                        value,
                        remaining: board.filter(
                            (c) => c.value === value && c.where === "free" && !pickedIds.includes(c.questionId),
                        ).length,
                        chosen: pickedIds.filter(
                            (id) => board.find((c) => c.questionId === id)?.value === value,
                        ).length,
                    }))}
                />
            </QuestionCard>
        </PlayerStage>
    )
}
