import { AudienceFace, PlayerStage, Progress, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import { STRIP_R, pt } from "../geometry"

type KhoiDongRiengPlayerCtx = PlayerCore

function runLabel(mine: boolean, playerName: string | null): string {
    if (mine) return "ĐẾN LƯỢT BẠN — trả lời miệng"
    if (playerName) return `Đang thi: ${playerName}`
    return "Điều hành đang gọi thí sinh…"
}

export function KhoiDongRiengAOCPlayer({ ctx }: { ctx: KhoiDongRiengPlayerCtx }) {
    const { v, myId, nameOf, audience } = ctx
    const oral = v.oral
    const mine = v.me.isMyRun === true
    const spent = oral ? Math.min(1, oral.elapsedS / Math.max(1, oral.budgetS)) : 0
    const budgetLeft = oral ? Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS)) : null
    return (
        <PlayerStage
            rail={<Rail variant="compact" view={v} myId={myId} />}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt cá nhân"
                right={
                    <>
                        <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                        <Timer remaining={null} fallback={budgetLeft !== null ? String(budgetLeft) : "45"} />
                    </>
                }
                question={oral?.question?.questionText ?? null}
                media={oral?.question?.media ?? null}
                face={
                    audience ? (
                        <AudienceFace options={oral?.question?.payload.options ?? []} />
                    ) : undefined
                }
                footer={
                <>
                    <span
                        className={`flex h-[3.3cqw] items-center rounded-lg px-[1.2cqw] font-sans font-semibold ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground ring-1 ring-border"}`}
                        style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                    >
                        {runLabel(mine, oral ? nameOf(oral.playerId) : null)}
                    </span>
                    {oral && (
                        <span className="flex h-[3.3cqw] min-w-[7cqw] flex-1 items-center overflow-hidden rounded-lg bg-muted ring-1 ring-border" style={{ borderRadius: STRIP_R }} title={`Ngân sách: ${oral.elapsedS}/${oral.budgetS}s`}>
                            <span className="h-full bg-amber-400/80 transition-all" style={{ width: `${spent * 100}%` }} />
                            <span className="px-[0.8cqw] font-sans tabular-nums text-foreground" style={{ fontSize: pt(12) }}>
                                {oral.budgetS - oral.elapsedS}s
                            </span>
                        </span>
                    )}
                </>
            
                }
            />
        </PlayerStage>
    )
}
