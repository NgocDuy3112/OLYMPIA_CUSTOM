import { Box, Badges, MainCard, Rail, Status, Strip, Timer, type DeckCtx } from "../deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Giải mã (S3): the keyword banner, the hint tiles, and the bottom question card.
// Pure: everything comes from DeckCtx.
export function GiaiMaScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, questions, baseCards, mcGiaiMa, flash, openRounds } = ctx
    const open = v.projection.open

    const keywordQ = questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    const keywordLength = typeof keywordQ?.payload.code === "string" ? keywordQ.payload.code.length : null
    const hintQuestions = questions
        .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
    const openHintId = mcGiaiMa?.openHintId ?? null
    const tileX = [0.51, 2.83, 5.15, 7.43]
    const tileY = [1.33, 2.79]
    const tileState = (qid: string): "free" | "open" | "used" =>
        qid === openHintId ? "open" : mcGiaiMa?.hintsPicked.includes(qid) ? "used" : "free"

    return (
        <>
            {keywordLength !== null && (
                <Box x={0.51} y={0.39} w={8.96} h={0.8} className="flex items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border">
                    <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(40) }}>
                        Mật mã gồm có {keywordLength} chữ cái
                    </span>
                </Box>
            )}
            {hintQuestions.slice(0, 8).map((q, i) => {
                const s = tileState(q._id)
                return (
                    <Box
                        key={q._id}
                        x={tileX[i % 4]} y={tileY[Math.floor(i / 4)]} w={2.03} h={1.32}
                        onClick={started && s === "free" ? () => ctx.send({ kind: "giai-ma.openHint", hintId: q._id }) : undefined}
                        title={s === "free" ? "Mở hint này" : s === "open" ? "cửa sổ đang mở" : "hint đã dùng"}
                        className={`flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${s === "free"
                                ? started
                                    ? "bg-card text-foreground ring-1 ring-border cursor-pointer hover:ring-sky-500"
                                    : "bg-card text-foreground ring-1 ring-border"
                                : s === "open"
                                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                                    : "bg-muted text-muted-foreground ring-1 ring-border"
                            }`}
                        style={{ fontSize: pt(60) }}
                    >
                        {i + 1}
                    </Box>
                )
            })}
            <MainCard y={4.27} h={2.08}>
                <Badges round="Giải mã" y={4.38} size={28} onRoundClick={openRounds} />
                {/* the clock: top right of the QUESTION card */}
                <Timer y={4.38} size={32} remaining={remaining} />
                <Box x={0.65} y={4.98} w={8.57} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                    {open.length > 0 ? open[0].question?.questionText ?? "" : "Chọn một hint để mở cửa sổ trả lời"}
                </Box>
            </MainCard>
            <Rail variant="answers" cards={baseCards} />
            <Strip
                slide={3}
                items={[
                    { label: "Tính giờ", empty: true, muted: true }, // the clock lives top-right only
                    { label: "Đúng", onClick: started ? () => ctx.send({ kind: "giai-ma.resolveHint" }) : undefined},
                    { label: "Sai"},
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status y={7.06} error={flash} hint={open.length > 0 ? "cửa sổ hint đang mở" : `${hintQuestions.length - (mcGiaiMa?.hintsPicked.length ?? 0)} hint còn lại`} />
        </>
    )
}
