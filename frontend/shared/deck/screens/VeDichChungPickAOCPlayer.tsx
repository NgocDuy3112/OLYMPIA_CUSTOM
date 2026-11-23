import { PlayerStage, QuestionCard, QuestionChips, Rail, Timer, type PlayerCore } from "../player-deck"
import { VeDichPickBoard } from "../ve-dich-pick-board"

type VeDichChungPickAOCPlayerCtx = PlayerCore


export function VeDichChungPickAOCPlayer({ ctx }: { ctx: VeDichChungPickAOCPlayerCtx }) {
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
                mode="Lượt chung"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={pickedCells.map((cell) => ({
                                id: cell.id,
                                label: String(cell.value),
                                active: true,
                                title: `Đã chọn câu ${cell.value} điểm`,
                            }))}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <VeDichPickBoard cells={board} pickedIds={pickedIds} />
            </QuestionCard>
        </PlayerStage>
    )
}
