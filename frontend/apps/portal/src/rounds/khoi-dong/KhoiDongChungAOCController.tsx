import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"

// Khởi động — lượt chung (S2): the whole field faces 6 shared questions, one
// deadline; the MC picks a square to judge per card. Pure: every value comes
// from its narrow ctx — no hooks here.
import type { ConsoleQuestion } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Khởi động · lượt chung: the shared batch + the judging ledger. */
export type KhoiDongChungCtx = ScreenCore & {
    remaining: number | null
    judgingId: string | null
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
}

export function KhoiDongChungAOCController({ ctx }: { ctx: KhoiDongChungCtx }) {
    const { v, remaining, baseCards, flash, openRounds } = ctx
    const open = v.projection.open
    const activeQ = ctx.judgingId
    const activeQuestionId = activeQ ?? open[0]?.questionId ?? ""

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                ...verdictActions({ canVerdict: ctx.target !== null, onVerdict: ctx.setVerdict }),
                backToLobbyAction(ctx.ketThuc),
            ]}
            flash={flash}
        >
            <QuestionFrame
                round="Khởi động"
                mode="Lượt chung"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress
                            total={open.length || 6}
                            done={0}
                            active={activeQ ? open.findIndex((q) => q.questionId === activeQ) : 0}
                            onPick={(i) => open[i] && ctx.setSelectedQ(open[i].questionId)}
                        />
                        <Timer remaining={remaining} />
                    </>
                }
                question={ctx.byId(activeQuestionId)?.questionText ?? "Cả bảng đang trả lời…"}
                media={open.find((q) => q.questionId === activeQuestionId)?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
