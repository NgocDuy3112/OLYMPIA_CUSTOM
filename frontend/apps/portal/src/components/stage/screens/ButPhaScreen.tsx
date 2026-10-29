import { Badges, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, type DeckCtx } from "../deck"

// Bứt phá (S4): sequential typed questions, one open at a time — Tính giờ
// opens, Đúng/Sai judge the ledger, Về sảnh ends. Pure: DeckCtx in, JSX out.
export function ButPhaScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, roundEnded, started, remaining, baseCards, bpDone, flash, openRounds } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = roundEnded ? 4 : pos ?? bpDone

    return (
        <StageLayout rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Bứt phá" onRoundClick={openRounds} />}
                    right={
                        <>
                            <Progress total={4} done={done} active={pos ?? done} />
                            <Timer remaining={remaining} />
                        </>
                    }
                />
                <QuestionBlock question={openQ?.question?.questionText ?? "Nhấn Tính giờ để mở câu tiếp theo"} />
            </MainCard>
            <Strip
                items={[
                    { label: "Tính giờ", onClick: openQ ? undefined : started ? () => ctx.send({ kind: "but-pha.openQuestion" }) : undefined },
                    { label: "Đúng", onClick: ctx.target && openQ ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target && openQ ? () => ctx.setVerdict(false) : undefined },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status error={flash} hint={openQ ? `câu ${done + 1}/4` : roundEnded ? "đã hết câu" : "mở câu tiếp theo bằng Tính giờ"} />
        </StageLayout>
    )
}
