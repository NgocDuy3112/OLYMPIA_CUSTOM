import { formatRemaining } from "@shared/lib/clock"
import { Badges, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, type DeckCtx } from "../deck"

// Khởi động — lượt cá nhân (S1): one player's oral run, projected to the whole
// room. Nobody types here — the MC's stopwatch drives Đúng/Sai. Pure: every
// value comes from the orchestrator's DeckCtx — no hooks here.
export function KhoiDongRiengScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, started, baseCards, flash, openRounds } = ctx
    const oral = v.projection.oral
    const overBudget = oral
        ? ctx.watchMs > Math.max(0, (oral.budgetS - oral.elapsedS) * 1000)
        : false
    return (
        <StageLayout rail={<Rail variant="compact" cards={baseCards} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Khởi động" mode="Lượt cá nhân" onRoundClick={openRounds} />}
                    right={
                        <>
                            <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                            <Timer remaining={null} fallback={oral ? String(Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS))) : "45"} />
                        </>
                    }
                />
                <QuestionBlock question={oral?.question?.questionText ?? "Đang chuyển người chơi…"} />
            </MainCard>
            <Strip
                items={[
                    {
                        label: "Tính giờ",
                        content: ctx.watchRunning ? `⏱ ${formatRemaining(ctx.watchMs)}` : "Tính giờ",
                        onClick: ctx.toggleWatch,
                    },
                    { label: "Đúng", onClick: oral && !overBudget ? () => ctx.send({ kind: "khoi-dong.recordOral", correct: true, spentS: Math.max(0, Math.floor(ctx.watchMs / 1000)) }) : undefined },
                    { label: "Sai", onClick: oral && !overBudget ? () => ctx.send({ kind: "khoi-dong.recordOral", correct: false, spentS: Math.max(0, Math.floor(ctx.watchMs / 1000)) }) : undefined },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status error={flash} hint={overBudget ? "vượt ngân sách" : oral ? `câu ${oral.index + 1}/${oral.total}` : "chuyển người chơi…"} />
        </StageLayout>
    )
}
