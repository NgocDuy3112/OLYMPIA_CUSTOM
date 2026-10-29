import { Badges, CardHeader, MainCard, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, VeDichStripCells, type DeckCtx } from "../deck"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the picked player
// types the answer, the MC judges. Pure: everything comes from DeckCtx.
export function VeDichChungScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
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
                <QuestionBlock question={openNow.question?.questionText ?? ""} />
            </MainCard>
            <Strip
                items={[
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined },
                    { label: "Hết lượt", onClick: needsVerdict ? undefined : () => ctx.hetLuot() },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status
                error={flash}
                hint={mcVeDich?.turnPlayerId ? "thí sinh đang đáp" : undefined}
            />
        </StageLayout>
    )
}
