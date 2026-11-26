import { PlayerStage, QuestionCard, QuestionChips, Rail, Timer, type PlayerCore } from "../player-deck"
import { pt } from "../geometry"
import { RIENG_PICK_VALUES } from "../ve-dich-board"
import { VeDichPickBoard } from "../ve-dich-pick-board"

type VeDichRiengPickAOCPlayerCtx = PlayerCore



export function VeDichRiengPickAOCPlayer({ ctx }: { ctx: VeDichRiengPickAOCPlayerCtx }) {
    const { v } = ctx
    const board = v.board ?? []
    const myPicks = v.me.pendingPicks
    // The LED view carries no per-player `me.pendingPicks` (audience.ts:21), so the staged set
    // is read off the public board, where `pending` marks this turn's picks until Xác nhận.
    const stagedIds = myPicks
        ?? board.filter((cell) => cell.where === "pending").map((cell) => cell.questionId)

    const pickedCells = stagedIds.flatMap((id) => {
        const cell = board.find((c) => c.questionId === id)
        if (!cell) return []
        return [{ id: cell.questionId, value: cell.value }]
    })
    // The turn is individual, so name the picker: the deck never shows whose turn it is.
    const turnName = v.turnPlayerId ? ctx.nameOf(v.turnPlayerId) : null

    return (
        <PlayerStage
            rail={<Rail view={v} myId={ctx.myId} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        {turnName && (
                            <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                                Lượt: {turnName}
                            </span>
                        )}
                        <QuestionChips
                            chips={pickedCells.map((cell) => ({
                                id: cell.id,
                                label: String(cell.value),
                                active: true,
                                // A staged pick is not on stage yet — only the open question breathes.
                                live: false,
                                title: `Đã chọn câu ${cell.value} điểm`,
                            }))}
                        />
                        <Timer remaining={null} />
                    </span>
                }
            >
                <VeDichPickBoard cells={board} pickedIds={myPicks ?? []} values={RIENG_PICK_VALUES} />
            </QuestionCard>
        </PlayerStage>
    )
}
