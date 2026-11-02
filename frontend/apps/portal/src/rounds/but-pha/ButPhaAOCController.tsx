import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

// Bứt phá (S4): four typed questions, one open at a time — Tính giờ opens the
// next, Đúng/Sai stage the verdict, Hết lượt's finalize is the round's own plan.
import type { ConsoleQuestion } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Bứt phá: four typed questions, one open at a time. */
export type ButPhaCtx = ScreenCore & {
    remaining: number | null
    pickQuestion: () => void
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
}

export function ButPhaAOCController({ ctx }: { ctx: ButPhaCtx }) {
    const { v, remaining, baseCards, flash, openRounds } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = pos ?? 0

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                { label: COPY.startClock, onClick: ctx.pickQuestion },
                ...verdictActions({ canVerdict: ctx.target !== null && openQ !== null, onVerdict: ctx.setVerdict }),
                backToLobbyAction(ctx.ketThuc),
            ]}
            flash={flash}
        >
            <QuestionFrame
                round="Bứt phá"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress total={4} done={done} active={pos ?? done} />
                        <Timer remaining={remaining} />
                    </>
                }
                question={openQ?.question?.questionText ?? "Nhấn Tính giờ để mở câu tiếp theo"}
                media={openQ?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
