import { Badges, Band, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Timer, type PlayerCtx } from "@shared/deck/player-deck"
import { STRIP_R, pt } from "@shared/deck/geometry"

// Khởi động — lượt cá nhân (S1): the oral run projected to everyone. Nobody
// types — the band carries the run status + budget bar. Pure: every value
// comes from the orchestrator's PlayerCtx.
export function KhoiDongRiengOC4Player({ ctx }: { ctx: PlayerCtx }) {
    const { v, myId, flash, nameOf } = ctx
    const oral = v.oral
    const mine = v.me.isMyRun === true
    const spent = oral ? Math.min(1, oral.elapsedS / Math.max(1, oral.budgetS)) : 0
    const budgetLeft = oral ? Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS)) : null
    return (
        <StageLayout rail={<Rail variant="compact" view={v} myId={myId} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Khởi động" mode="Lượt cá nhân" />}
                    right={
                        <>
                            <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                            <Timer remaining={null} fallback={budgetLeft !== null ? String(budgetLeft) : "45"} />
                        </>
                    }
                />
                <QuestionBlock question={oral?.question?.questionText ?? null} media={oral?.question?.media ?? null} />
            </MainCard>
            <Band>
                <span
                    className={`flex h-[3.3cqw] items-center rounded-lg px-[1.2cqw] font-sans font-semibold ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground ring-1 ring-border"}`}
                    style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                >
                    {mine ? "ĐẾN LƯỢT BẠN — trả lời miệng" : oral ? `Đang thi: ${nameOf(oral.playerId)}` : "MC đang gọi thí sinh…"}
                </span>
                {oral && (
                    <span className="flex h-[3.3cqw] min-w-[7cqw] flex-1 items-center overflow-hidden rounded-lg bg-muted ring-1 ring-border" style={{ borderRadius: STRIP_R }} title={`Ngân sách: ${oral.elapsedS}/${oral.budgetS}s`}>
                        <span className="h-full bg-amber-400/80 transition-all" style={{ width: `${spent * 100}%` }} />
                        <span className="px-[0.8cqw] font-sans tabular-nums text-foreground" style={{ fontSize: pt(11) }}>
                            {oral.budgetS - oral.elapsedS}s
                        </span>
                    </span>
                )}
            </Band>
            <Status error={flash} hint={oral ? `câu ${oral.index + 1}/${oral.total}` : "mọi thí sinh cùng xem"} />
        </StageLayout>
    )
}
