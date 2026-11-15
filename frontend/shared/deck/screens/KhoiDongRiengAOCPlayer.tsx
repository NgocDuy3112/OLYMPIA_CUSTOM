import type { ReactNode } from "react"
import { useCountdownMs } from "@shared/lib/clock"
import { AudienceFace, PlayerStage, Progress, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"

type KhoiDongRiengPlayerCtx = PlayerCore



export function KhoiDongRiengAOCPlayer({ ctx }: { ctx: KhoiDongRiengPlayerCtx }) {
    const { v, myId, audience } = ctx
    const oral = v.oral
    let budgetLeft: number | null = null
    if (oral) budgetLeft = Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS))
    const qid = oral?.questionId ?? null
    const questionShown = oral?.question != null
    let startMs: number | null = null
    if (qid !== null) {
        if (questionShown) {
            if (budgetLeft !== null) startMs = budgetLeft * 1000
        }
    }
    const left = useCountdownMs(startMs, qid)
    let faceSlot: ReactNode = undefined
    if (audience) {
        faceSlot = <AudienceFace options={oral?.question?.payload.options ?? []} />
    }
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
                        <Timer remaining={left} />
                    </>
                }
                question={oral?.question?.questionText ?? null}
                media={oral?.question?.media ?? null}
                face={faceSlot}
                
            />
        </PlayerStage>
    )
}
