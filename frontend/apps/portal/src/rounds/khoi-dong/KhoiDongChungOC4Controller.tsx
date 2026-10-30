import { Badges, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Strip, Timer, type DeckCtx } from "@/components/stage/deck"

// Khởi động — lượt chung (S2): the whole field faces 6 shared questions, one
// deadline; the MC picks a square to judge per card. Pure: every value comes
// from the orchestrator's DeckCtx — no hooks here.
export function KhoiDongChungOC4Controller({ ctx }: { ctx: DeckCtx }) {
    const { v, started, remaining, baseCards, flash, openRounds } = ctx
    const open = v.projection.open
    const activeQ = ctx.judgingId

    return (
        <StageLayout rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}>
            <MainCard>
                <CardHeader
                    left={<Badges round="Khởi động" mode="Lượt chung" onRoundClick={openRounds} />}
                    right={
                        <>
                            <Progress total={open.length || 6} done={0} active={activeQ ? open.findIndex((q) => q.questionId === activeQ) : 0} onPick={(i) => open[i] && ctx.setSelectedQ(open[i].questionId)} />
                            <Timer remaining={remaining} />
                        </>
                    }
                />
                <QuestionBlock question={ctx.byId(activeQ ?? open[0]?.questionId ?? "")?.questionText ?? "Cả bảng đang trả lời…"} />
            </MainCard>
            <Strip
                items={[
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status error={flash} hint="chọn ô để so câu khác" />
        </StageLayout>
    )
}
