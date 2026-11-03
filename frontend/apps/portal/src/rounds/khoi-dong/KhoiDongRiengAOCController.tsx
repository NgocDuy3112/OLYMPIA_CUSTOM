import { formatRemaining } from "@shared/lib/clock"
import { COPY } from "@shared/deck/copy"
import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"

// Khởi động — lượt cá nhân (S1): one player's oral run, projected to the whole
// room. Nobody types here — the console's stopwatch drives Đúng/Sai. Pure: every
// value comes from its narrow ctx — no hooks here.
import type { ScreenCore } from "../types"

/** Khởi động · lượt cá nhân: the oral run + the console's stopwatch. */
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
    // Đúng/Sai here RECORD the oral verdict with the stopwatch's spend, so they
    // need a live run; over budget the pair goes display-only.
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
            <QuestionFrame
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
