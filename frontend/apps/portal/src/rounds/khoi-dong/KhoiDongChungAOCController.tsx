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
    const { v, remaining, baseCards, flash, openRounds, consoleKhoiDong, target, toggleSelect, selectedIds, sendChain } = ctx
    const openNow = v.projection.open[0]
    const index = consoleKhoiDong?.questionIndex ?? 0
    const total = consoleKhoiDong?.questionCount || 6
    const windowOpen = consoleKhoiDong?.windowOpen ?? false

    // one press grades every ticked card; with nothing ticked it still falls
    // back to the single player the console is pointed at
    const gradeable = () => {
        if (selectedIds.size > 0) return [...selectedIds]
        return target !== null ? [target] : []
    }
    const judge = (correct: boolean) => {
        const ids = gradeable()
        if (ids.length === 0) return
        sendChain(ids.map((playerId) => ({ kind: "khoi-dong.judge" as const, playerId, correct })))
    }

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={toggleSelect} />}
            actions={[
                {
                    label: "Bấm giờ",
                    onClick: !windowOpen && openNow
                        ? () => ctx.send({ kind: "khoi-dong.startWindow" })
                        : undefined,
                },
                ...verdictActions({ canVerdict: gradeable().length > 0 && openNow !== null, onVerdict: judge }),
                {
                    label: "Hiện đáp án",
                    onClick: openNow
                        ? () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
                        : undefined,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt chung"
                onRoundClick={openRounds}
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
                question={
                    openNow?.question?.questionText ??
                    (index >= total ? "Đã hết sáu câu — Kết thúc vòng để chốt điểm" : "Chờ mở câu tiếp theo…")
                }
                media={openNow?.question?.media ?? null}
                onReveal={!openNow && index < total
                    ? () => ctx.send({ kind: "khoi-dong.nextQuestion" })
                    : undefined}
            />
        </ConsoleStage>
    )
}
