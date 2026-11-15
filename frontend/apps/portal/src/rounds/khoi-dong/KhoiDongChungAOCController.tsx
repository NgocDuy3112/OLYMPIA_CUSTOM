import { ConsoleStage, Progress, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import type { KhoiDongConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type KhoiDongChungCtx = ScreenCore & {
    remaining: number | null
    consoleKhoiDong: KhoiDongConsole | null
    target: string | null
    setSelectedPlayer: (userId: string) => void
}

export function KhoiDongChungAOCController({ ctx }: { ctx: KhoiDongChungCtx }) {
    const { v, remaining, baseCards, flash, consoleKhoiDong, target, toggleSelect, selectedIds, sendChain } = ctx
    const openNow = v.projection.open[0]
    const index = consoleKhoiDong?.questionIndex ?? 0
    const total = consoleKhoiDong?.questionCount || 6
    const windowOpen = consoleKhoiDong?.windowOpen ?? false

    const gradeable = () => {
        if (selectedIds.size > 0) return [...selectedIds]
        if (target !== null) return [target]
        return []
    }
    const judge = (correct: boolean) => {
        const ids = gradeable()
        if (ids.length === 0) return
        sendChain(ids.map((playerId) => ({ kind: "khoi-dong.judge" as const, playerId, correct })))
    }

    let startWindow: (() => void) | undefined = undefined
    if (!windowOpen) {
        if (openNow) startWindow = () => ctx.send({ kind: "khoi-dong.startWindow" })
    }
    let revealAnswer: (() => void) | undefined = undefined
    if (openNow) {
        revealAnswer = () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
    }
    const questionText: string | null = openNow?.question?.questionText ?? null
    let nextQuestion: (() => void) | undefined = undefined
    if (!openNow) {
        if (index < total) nextQuestion = () => ctx.send({ kind: "khoi-dong.nextQuestion" })
    }

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={toggleSelect} />}
            actions={[
                {
                    label: "Bấm giờ",
                    onClick: startWindow,
                },
                ...verdictActions({ canVerdict: gradeable().length > 0 && openNow !== null, onVerdict: judge }),
                {
                    label: "Hiện đáp án",
                    onClick: revealAnswer,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <Progress
                            total={total}
                            done={index}
                            active={index}
                            onPick={(i) => {
                                if (i === index + 1) ctx.send({ kind: "khoi-dong.nextQuestion" })
                            }}
                        />
                        <Timer remaining={remaining} fallback="10" />
                    </>
                }
                question={questionText}
                media={openNow?.question?.media ?? null}
                onReveal={nextQuestion}
            />
        </ConsoleStage>
    )
}
