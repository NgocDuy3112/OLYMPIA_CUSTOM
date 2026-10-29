import { Badges, MainCard, Progress, QuestionBlock, Rail, Status, Strip, Timer, type DeckCtx } from "../deck"


export function ButPhaScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, roundEnded, started, remaining, baseCards, bpDone, flash, openRounds } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = roundEnded ? 4 : pos ?? bpDone

    return (
        <>
            <MainCard>
                <Badges round="Bứt phá" onRoundClick={openRounds} />
                <Progress total={4} done={done} active={pos ?? done} />
                <Timer remaining={remaining} />
                <QuestionBlock question={openQ?.question?.questionText ?? "Nhấn Tính giờ để mở câu tiếp theo"} />
            </MainCard>
            <Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />
            <Strip
                slide={4}
                items={[
                    openQ
                        ? { label: "Tính giờ", empty: true, muted: true } // the clock lives top-right only
                        : { label: "Tính giờ", onClick: started ? () => ctx.send({ kind: "but-pha.openQuestion" }) : undefined},
                    { label: "Đúng", onClick: ctx.target && openQ ? () => ctx.setVerdict(true) : undefined},
                    { label: "Sai", onClick: ctx.target && openQ ? () => ctx.setVerdict(false) : undefined},
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status y={5.23} error={flash} hint={openQ ? `câu ${done + 1}/4` : roundEnded ? "đã hết câu" : "mở câu tiếp theo bằng Tính giờ"} />
        </>
    )
}
