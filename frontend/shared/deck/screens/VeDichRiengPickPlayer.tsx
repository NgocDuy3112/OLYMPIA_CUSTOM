import { PlayerStage, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import { ValueCells } from "../value-cells"

type VeDichRiengPickPlayerCtx = PlayerCore



export function VeDichRiengPickPlayer({ ctx }: { ctx: VeDichRiengPickPlayerCtx }) {
    const { v } = ctx

    return (
        <PlayerStage
            rail={<Rail view={v} myId={ctx.myId} />}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt cá nhân"
                right={<Timer remaining={null} />}
            >
                <ValueCells
                    cells={[20, 30, 40, 50].map((value) => {
                        const picked = v.me.pendingPicks ?? []
                        return {
                            value,
                            remaining: (v.board ?? []).filter(
                                (c) => c.value === value && c.where === "free" && !picked.includes(c.questionId),
                            ).length,
                            chosen: picked.filter(
                                (id) => (v.board ?? []).find((c) => c.questionId === id)?.value === value,
                            ).length,
                        }
                    })}
                />
            </QuestionCard>
        </PlayerStage>
    )
}
