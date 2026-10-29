import { Box, Badges, MainCard, QuestionBlock, Rail, Status, Strip, Timer, type DeckCtx } from "../deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the picked player
// types the answer, the MC judges. Pure: everything comes from DeckCtx.
export function VeDichChungScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection

    // ── the strip of used cells above the question ────────────────────────────
    const stripCells = (projection.board ?? []).filter((c) => c.where !== "free").slice(0, 4)
    const stripX = [2.7, 4.2, 5.66, 7.14]
    const openNow = projection.open[0]
    const qid = openNow.questionId
    const needsVerdict =
        mcVeDich?.answererId ? ctx.verdictOf(qid, mcVeDich.answererId) === null : true

    return (
        <>
            <MainCard>
                <Badges round="Về đích" mode="Lượt chung" onRoundClick={openRounds} />
                {stripCells.slice(0, stripX.length).map((c, i) => (
                    <Box key={c.questionId} x={stripX[i]} y={0.65} w={1.33} h={0.59}
                        className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${c.where === "open" ? "bg-primary text-primary-foreground ring-primary" : "bg-muted ring-border"}`}
                        style={DECK_PAD}
                    >
                        <span className="truncate px-1 text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{c.domain}</span>
                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{c.value}</b>
                    </Box>
                ))}
                <Timer remaining={remaining} />
                <QuestionBlock question={openNow.question?.questionText ?? ""} />
            </MainCard>
            <Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />
            <Strip
                slide={7}
                items={[
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined},
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined},
                    { label: "Hết lượt", onClick: needsVerdict ? undefined : () => ctx.hetLuot()},
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status
                y={5.22}
                error={flash}
                hint={mcVeDich?.turnPlayerId ? "thí sinh đang đáp" : undefined}
            />
        </>
    )
}
