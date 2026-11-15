import type { ReactNode } from "react"
import { AudienceFace, PlayerStage, Progress, QuestionCard, Rail, type PlayerCore } from "../player-deck"

type KhoiDongRiengPlayerCtx = PlayerCore



export function KhoiDongRiengAOCPlayer({ ctx }: { ctx: KhoiDongRiengPlayerCtx }) {
    const { v, myId, audience } = ctx
    const oral = v.oral
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
                    </>
                }
                question={oral?.question?.questionText ?? null}
                media={oral?.question?.media ?? null}
                face={faceSlot}
                
            />
        </PlayerStage>
    )
}
