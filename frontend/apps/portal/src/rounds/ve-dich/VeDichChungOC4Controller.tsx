import { Badges, CardHeader, MainCard, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, VeDichStripCells } from "@/components/stage/deck"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the picked player
// types the answer, the MC judges. Pure: everything comes from its ctx.
import type { VeDichMc } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · phase 1 question: the typed answer + the judging strip. */
export type VeDichChungCtx = ScreenCore & {
    remaining: number | null
    mcVeDich: VeDichMc | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichChungOC4Controller({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where !== "free")
    const openNow = projection.open[0]
    const qid = openNow.questionId
    const needsVerdict =
        mcVeDich?.answererId ? ctx.verdictOf(qid, mcVeDich.answererId) === null : true

    return (
        <StageLayout rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Về đích" mode="Lượt chung" onRoundClick={openRounds} />}
                    mid={<VeDichStripCells cells={stripCells} phase2={false} />}
                    right={<Timer remaining={remaining} />}
                />
                <QuestionBlock question={openNow.question?.questionText ?? ""} media={openNow.question?.media ?? null} />
            </MainCard>
            <Strip
                items={[
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined },
                    { label: "Hết lượt", onClick: needsVerdict ? undefined : () => ctx.hetLuot() },
                    { label: "Về sảnh", onClick: ctx.ketThuc },
                ]}
            />
            <Status error={flash} />
        </StageLayout>
    )
}
