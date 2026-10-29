import { Box, Badges, MainCard, QuestionBlock, Rail, Status, Strip, Timer, type DeckCtx } from "../deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Về đích — câu hỏi mở, phase 2 (S8, locked): the personal round — oral answer,
// the 5-second buzz window, and a verdict for both answerer and buzzer. Pure:
// everything comes from DeckCtx.
export function VeDichRiengScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection

    // ── the strip of used cells above the question ────────────────────────────
    const stripCells = (projection.board ?? []).filter((c) => c.where !== "free").slice(0, 3)
    const stripX = [4.2, 5.66, 7.14]
    const openNow = projection.open[0]
    const qid = openNow.questionId
    const needsVerdict =
        mcVeDich?.answererId ? ctx.verdictOf(qid, mcVeDich.answererId) === null : true
    const buzzerMissing =
        mcVeDich?.buzzerId ? ctx.verdictOf(qid, mcVeDich.buzzerId) === null : false

    return (
        <>
            <MainCard>
                <Badges round="Về đích" mode="Lượt cá nhân" onRoundClick={openRounds} />
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
            <Rail variant="compact" cards={baseCards} onSelect={ctx.setSelectedPlayer} />
            <Strip
                layout="ve-dich-rieng"
                items={[
                    {
                        label: "Mở chuông",
                        onClick: mcVeDich?.openStage === "current" ? () => ctx.send({ kind: "ve-dich.closeCurrentAnswer" }) : undefined,
                    },
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined},
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined},
                    { label: "Hết lượt", onClick: needsVerdict || buzzerMissing ? undefined : () => ctx.hetLuot()},
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status
                y={5.22}
                error={flash}
                hint={
                    mcVeDich?.openStage === "buzz"
                        ? "cửa sổ chuông 5s"
                        : "đóng phần trả lời → mở chuông"
                }
            />
        </>
    )
}
