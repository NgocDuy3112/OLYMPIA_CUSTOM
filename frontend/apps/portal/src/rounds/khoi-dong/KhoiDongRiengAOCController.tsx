import { formatRemaining } from "@shared/lib/clock"
import { COPY } from "@shared/deck/copy"
import { ConsoleStage, Progress, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"

import type { ScreenCore } from "../types"

export type KhoiDongRiengCtx = ScreenCore & {
    watchRunning: boolean
    watchMs: number
    toggleWatch: () => void
}

export function KhoiDongRiengAOCController({ ctx }: { ctx: KhoiDongRiengCtx }) {
    const { v, baseCards, flash, openRounds } = ctx
    const oral = v.projection.oral
    const overBudget = oral
        ? ctx.watchMs > Math.max(0, (oral.budgetS - oral.elapsedS) * 1000)
        : false
    const canVerdict = Boolean(oral) && !overBudget
    const spentS = Math.max(0, Math.floor(ctx.watchMs / 1000))
    const record = (correct: boolean) => ctx.send({ kind: "khoi-dong.recordOral", correct, spentS })

    return (
        <ConsoleStage
            rail={<Rail variant="compact" cards={baseCards} />}
            actions={[
                {
                    label: COPY.startClock,
                    content: ctx.watchRunning ? `⏱ ${formatRemaining(ctx.watchMs)}` : COPY.startClock,
                    onClick: ctx.toggleWatch,
                },
                ...verdictActions({ canVerdict, onVerdict: record }),
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt cá nhân"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                        <Timer remaining={null} fallback={oral ? String(Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS))) : "45"} />
                    </>
                }
                question={oral?.question?.questionText ?? "Đang chuyển người chơi…"}
                media={oral?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
