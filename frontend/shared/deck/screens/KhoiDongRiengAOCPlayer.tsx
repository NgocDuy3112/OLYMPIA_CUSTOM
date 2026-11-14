import { AudienceFace, PlayerStage, Progress, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"

type KhoiDongRiengPlayerCtx = PlayerCore



export function KhoiDongRiengAOCPlayer({ ctx }: { ctx: KhoiDongRiengPlayerCtx }) {
    const { v, myId, audience } = ctx
    const oral = v.oral
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
                
            />
        </PlayerStage>
    )
}
