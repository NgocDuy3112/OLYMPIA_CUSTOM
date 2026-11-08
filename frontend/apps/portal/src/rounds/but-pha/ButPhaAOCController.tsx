import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

import type { ConsoleQuestion, ButPhaConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type ButPhaCtx = ScreenCore & {
    remaining: number | null
    pickQuestion: () => void
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
    consoleButPha: ButPhaConsole | null
}

export function ButPhaAOCController({ ctx }: { ctx: ButPhaCtx }) {
    const { v, remaining, baseCards, flash, openRounds, consoleButPha } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = pos ?? 0
    const revealId = consoleButPha?.opened === true ? consoleButPha.questionId : null

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                { label: COPY.startClock, onClick: ctx.pickQuestion },
                ...verdictActions({ canVerdict: ctx.target !== null && openQ !== null, onVerdict: ctx.setVerdict }),
                {
                    label: "Hiện đáp án",
                    onClick: revealId
                        ? () => ctx.send({ kind: "reveal.answer", questionId: revealId })
                        : undefined,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionFrame
                round="Bứt phá"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress total={4} done={done} active={pos ?? done} />
                        <Timer remaining={remaining} />
                    </>
                }
                question={openQ?.question?.questionText ?? "Nhấn Tính giờ để mở câu tiếp theo"}
                media={openQ?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
