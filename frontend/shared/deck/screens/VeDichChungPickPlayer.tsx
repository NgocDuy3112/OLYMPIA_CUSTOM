import { PlayerStage, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import { ValueCells } from "../value-cells"

type VeDichChungPickPlayerCtx = PlayerCore


export function VeDichChungPickPlayer({ ctx }: { ctx: VeDichChungPickPlayerCtx }) {
    const { v } = ctx
    const pickedIds = v.me.pendingPicks ?? []

    return (
        <PlayerStage
            rail={<Rail view={v} myId={ctx.myId} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                right={<Timer remaining={null} />}
            />
            <ValueCells
                cells={[20, 30].map((value) => ({
                    value,
                    remaining: (v.board ?? []).filter(
                        (c) => c.value === value && c.where === "free" && !pickedIds.includes(c.questionId),
                    ).length,
                    chosen: pickedIds.filter(
                        (id) => (v.board ?? []).find((c) => c.questionId === id)?.value === value,
                    ).length,
                }))}
            />
        </PlayerStage>
    )
}
