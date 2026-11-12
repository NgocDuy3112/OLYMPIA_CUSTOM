import { ConsoleStage, Progress, QuestionFrame, Rail, Timer } from "@/components/stage/deck"
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
    const { v, remaining, baseCards, flash, openRounds, consoleKhoiDong, target, setSelectedPlayer } = ctx
    const openNow = v.projection.open[0]
    const index = consoleKhoiDong?.questionIndex ?? 0
    const total = consoleKhoiDong?.questionCount || 6
    const windowOpen = consoleKhoiDong?.windowOpen ?? false

    const judge = (correct: boolean) => {
        if (!target) return
        ctx.send({ kind: "khoi-dong.judge", playerId: target, correct })
    }

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={setSelectedPlayer} />}
            actions={[
                {
                    label: "Bấm giờ",
                    onClick: !windowOpen && openNow
                        ? () => ctx.send({ kind: "khoi-dong.startWindow" })
                        : undefined,
                },
                ...verdictActions({ canVerdict: target !== null && openNow !== null, onVerdict: judge }),
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
            <QuestionFrame
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
                        <Timer remaining={remaining} fallback="10s" />
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
