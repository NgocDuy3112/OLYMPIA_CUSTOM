import { Badges, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Strip, Timer } from "@/components/stage/deck"

// Khởi động — lượt chung (S2): the whole field faces 6 shared questions, one
// deadline; the MC picks a square to judge per card. Pure: every value comes
// from its narrow ctx — no hooks here.
import type { ConsoleQuestion } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Khởi động · lượt chung: the shared batch + the judging ledger. */
export type KhoiDongChungCtx = ScreenCore & {
    remaining: number | null
    judgingId: string | null
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
}

export function KhoiDongChungOC4Controller({ ctx }: { ctx: KhoiDongChungCtx }) {
    const { v, remaining, baseCards, flash, openRounds } = ctx
    const open = v.projection.open
    const activeQ = ctx.judgingId
    const activeQuestionId = activeQ ?? open[0]?.questionId ?? ""

    return (
        <StageLayout rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} onAdjust={ctx.openAdjust} />}>
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
                <QuestionBlock
                    question={ctx.byId(activeQuestionId)?.questionText ?? "Cả bảng đang trả lời…"}
                    media={open.find((q) => q.questionId === activeQuestionId)?.question?.media ?? null}
                />
            </MainCard>
            <Strip
                items={[
                    { label: "Đúng", onClick: ctx.target ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target ? () => ctx.setVerdict(false) : undefined },
                    { label: "Về sảnh", onClick: ctx.ketThuc },
                ]}
            />
            <Status error={flash} hint="chọn ô để so câu khác" />
        </StageLayout>
    )
}
