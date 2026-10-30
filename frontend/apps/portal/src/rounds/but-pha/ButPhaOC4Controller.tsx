import { Badges, CardHeader, MainCard, Progress, QuestionBlock, Rail, StageLayout, Status, Strip, Timer } from "@/components/stage/deck"

// Bứt phá (S4): sequential typed questions, one open at a time — Tính giờ
// opens, Đúng/Sai judge the ledger, Về sảnh ends. Pure: its ctx in, JSX out.
import type { ConsoleQuestion } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Bứt phá: four typed questions, one open at a time. */
export type ButPhaCtx = ScreenCore & {
    remaining: number | null
    pickQuestion: () => void
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
}

export function ButPhaOC4Controller({ ctx }: { ctx: ButPhaCtx }) {
    const { v, remaining, baseCards, flash, openRounds } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = pos ?? 0

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
                    { label: "Tính giờ", onClick: () => ctx.pickQuestion() },
                    { label: "Đúng", onClick: ctx.target && openQ ? () => ctx.setVerdict(true) : undefined },
                    { label: "Sai", onClick: ctx.target && openQ ? () => ctx.setVerdict(false) : undefined },
                    { label: "Về sảnh", onClick: ctx.ketThuc },
                ]}
            />
            <Status error={flash} hint={openQ ? `câu ${done + 1}/4` : "mở câu tiếp theo bằng Tính giờ"} />
        </StageLayout>
    )
}
