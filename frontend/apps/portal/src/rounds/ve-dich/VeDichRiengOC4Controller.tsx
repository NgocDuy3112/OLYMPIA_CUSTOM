import { Badges, CardHeader, MainCard, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, VeDichStripCells } from "@/components/stage/deck"

// Về đích — câu hỏi mở, phase 2 (S8, locked): the personal round — oral answer,
// the 5-second buzz window, and a verdict for both answerer and buzzer. Pure:
// everything comes from its ctx.
import type { VeDichMc } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · phase 2 question: oral + buzz + powers + the judging strip. */
export type VeDichRiengCtx = ScreenCore & {
    remaining: number | null
    mcVeDich: VeDichMc | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichRiengOC4Controller({ ctx }: { ctx: VeDichRiengCtx }) {
    const { v, started, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where !== "free")
    const openNow = projection.open[0]
    const qid = openNow.questionId
    const needsVerdict =
        mcVeDich?.answererId ? ctx.verdictOf(qid, mcVeDich.answererId) === null : true
    const buzzerMissing =
        mcVeDich?.buzzerId ? ctx.verdictOf(qid, mcVeDich.buzzerId) === null : false

    return (
        <StageLayout rail={<Rail variant="compact" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Về đích" mode="Lượt cá nhân" onRoundClick={openRounds} />}
                    mid={<VeDichStripCells cells={stripCells} phase2 />}
                    right={<Timer remaining={remaining} />}
                />
                <QuestionBlock question={openNow.question?.questionText ?? ""} />
            </MainCard>
            <Strip
                items={[
                    {
                        label: "Mở chuông",
                        onClick: mcVeDich?.openStage === "current" ? () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" }) : undefined,
                    },
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined },
                    { label: "Hết lượt", onClick: needsVerdict || buzzerMissing ? undefined : () => ctx.hetLuot() },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status
                error={flash}
                hint={
                    mcVeDich?.openStage === "buzz"
                        ? "cửa sổ chuông 5s"
                        : "đóng phần trả lời → mở chuông"
                }
            />
        </StageLayout>
    )
}
