import { Badges, CardHeader, MainCard, Rail, StageLayout, Status, Strip, Timer, type DeckCtx } from "@/components/stage/deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Giải mã (S3): the hint tile grid (count-driven — any hint count fits), then
// the lower question card, the keyword strip and the ledger rail. Pure: DeckCtx.
export function GiaiMaOC4Controller({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, questions, baseCards, mcGiaiMa, flash, openRounds } = ctx
    const open = v.projection.open

    const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    const keywordLength = typeof keywordQ?.payload.code === "string" ? keywordQ.payload.code.length : null
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = mcGiaiMa?.openHintId ?? null
    const tileState = (qid: string): "free" | "open" | "used" =>
        qid === openHintId ? "open" : mcGiaiMa?.hintsPicked.includes(qid) ? "used" : "free"

    return (
        <StageLayout rail={<Rail variant="answers" cards={baseCards} />}>
            {keywordLength !== null && (
                <div className="flex shrink-0 items-center justify-center rounded-2xl bg-card px-[2cqw] py-[0.7cqw] shadow-md ring-1 ring-border">
                    <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(32) }}>
                        Mật mã gồm có {keywordLength} chữ cái
                    </span>
                </div>
            )}

            {/* the tiles: a count-driven grid — any hint count fits, none dropped */}
            <div className="grid min-h-0 flex-1 content-start gap-x-[2.2cqw] gap-y-[1.1cqw]" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                {hintQuestions.map((q, i) => {
                    const s = tileState(q._id)
                    const interactive = started && s === "free"
                    return (
                        <div
                            key={q._id}
                            onClick={interactive ? () => ctx.send({ kind: "giai-ma.openHint", hintId: q._id }) : undefined}
                            role={interactive ? "button" : undefined}
                            tabIndex={interactive ? 0 : undefined}
                            onKeyDown={interactive ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    ctx.send({ kind: "giai-ma.openHint", hintId: q._id })
                                }
                            } : undefined}
                            className={`flex aspect-[203/132] items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${s === "free"
                                    ? interactive
                                        ? "cursor-pointer bg-card text-foreground ring-1 ring-border hover:ring-sky-500"
                                        : "bg-card text-foreground ring-1 ring-border"
                                    : s === "open"
                                        ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                                        : "bg-muted text-muted-foreground/50 ring-1 ring-border"
                                }`}
                            style={{ fontSize: pt(60) }}
                        >
                            {i + 1}
                        </div>
                    )
                })}
            </div>

            <MainCard className="min-h-[16cqw] flex-none">
                <CardHeader
                    left={<Badges round="Giải mã" size={28} onRoundClick={openRounds} />}
                    right={<Timer remaining={remaining} size={32} />}
                />
                <p className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {open.length > 0 ? open[0].question?.questionText ?? "" : "Chọn một hint để mở cửa sổ trả lời"}
                </p>
            </MainCard>
            <Strip
                items={[
                    { label: "Đúng", onClick: started ? () => ctx.send({ kind: "giai-ma.resolveHint" }) : undefined },
                    { label: "Sai" },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status error={flash} hint={open.length > 0 ? "cửa sổ hint đang mở" : `${hintQuestions.length - (mcGiaiMa?.hintsPicked.length ?? 0)} hint còn lại`} />
        </StageLayout>
    )
}
